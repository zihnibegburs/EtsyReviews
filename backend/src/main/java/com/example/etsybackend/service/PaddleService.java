package com.example.etsybackend.service;

import com.example.etsybackend.client.PaddleApiClient;
import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.PaddleEvent;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.model.SubscriptionStatus;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.PaddleEventRepository;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class PaddleService {
    private static final Logger log = LoggerFactory.getLogger(PaddleService.class);
    private static final Set<String> SUBSCRIPTION_EVENTS = Set.of(
            "subscription.created",
            "subscription.updated",
            "subscription.activated",
            "subscription.canceled",
            "subscription.past_due",
            "subscription.paused",
            "subscription.resumed",
            "subscription.trialing"
    );

    @Value("${paddle.api-key}")
    private String apiKey;

    @Value("${paddle.webhook-secret}")
    private String webhookSecret;

    @Value("${paddle.price-id-monthly}")
    private String priceIdMonthly;

    @Value("${paddle.price-id-yearly}")
    private String priceIdYearly;

    @Value("${paddle.success-url}")
    private String successUrl;

    @Value("${paddle.cancel-url}")
    private String cancelUrl;

    @Value("${paddle.environment:sandbox}")
    private String environment;

    @Value("${paddle.checkout-url:}")
    private String checkoutPageUrl;

    private final PaddleApiClient apiClient;
    private final ObjectMapper objectMapper;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final PaddleEventRepository eventRepository;

    public PaddleService(
            PaddleApiClient apiClient,
            ObjectMapper objectMapper,
            SubscriptionRepository subscriptionRepository,
            UserRepository userRepository,
            PaddleEventRepository eventRepository
    ) {
        this.apiClient = apiClient;
        this.objectMapper = objectMapper;
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
    }

    @PostConstruct
    void logConfigStatus() {
        if (isMissingConfig(apiKey) || isMissingConfig(priceIdMonthly) || isMissingConfig(priceIdYearly)) {
            log.warn(
                    "Paddle config is incomplete. Checkout will fail until api-key and price IDs are set."
            );
        }
        if (isBlankConfig(checkoutPageUrl)) {
            log.warn(
                    "Paddle checkout page is not configured. Set paddle.checkout-url "
                            + "(must match Paddle Dashboard > Checkout > Default payment link)."
            );
        }
        if (!isBlankConfig(webhookSecret) && webhookSecret.startsWith("ntfset_")
                && !webhookSecret.startsWith("pdl_ntfset_")) {
            log.warn(
                    "paddle.webhook-secret looks like a notification destination ID (ntfset_...), "
                            + "not the endpoint secret key. In Paddle Dashboard > Notifications > Edit destination, "
                            + "copy the secret key field (starts with pdl_ntfset_...)."
            );
        }
    }

    public String createCheckoutUrl(Long userId, String email, String name, String priceId) {
        ensurePaddleConfigured();
        ensureCheckoutPageConfigured();
        ensureNoActiveSubscription(userId);

        String normalizedEmail = normalizeEmail(email);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String customerId = resolvePaddleCustomerId(user, normalizedEmail, name);

        JsonNode transaction = apiClient.createTransaction(
                customerId,
                priceId,
                userId,
                checkoutPageUrl,
                successUrl,
                cancelUrl
        );

        String checkoutUrl = transaction.path("checkout").path("url").asText(null);
        if (checkoutUrl == null || checkoutUrl.isBlank()) {
            throw new RuntimeException(
                    "Paddle did not return checkout.url. Set Default payment link in Paddle Dashboard "
                            + "and paddle.checkout-url to the same page (e.g. /checkout/pay)."
            );
        }

        log.info("Paddle checkout URL: {}", checkoutUrl);
        return checkoutUrl;
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            throw new RuntimeException("A valid email is required for checkout");
        }
        String normalized = email.trim();
        if (normalized.isBlank() || !normalized.contains("@")) {
            throw new RuntimeException("A valid email is required for checkout");
        }
        return normalized;
    }

    private String resolvePaddleCustomerId(User user, String email, String name) {
        String customerId = user.getPaddleCustomerId();
        if (customerId != null && !customerId.isBlank()) {
            return customerId;
        }

        Optional<String> existingCustomerId = apiClient.findCustomerIdByEmail(email);
        if (existingCustomerId.isPresent()) {
            customerId = existingCustomerId.get();
            user.setPaddleCustomerId(customerId);
            userRepository.save(user);
            return customerId;
        }

        JsonNode customer = apiClient.createCustomer(email, name);
        customerId = customer.path("id").asText(null);
        if (customerId == null || customerId.isBlank()) {
            throw new RuntimeException("Failed to create Paddle customer");
        }
        user.setPaddleCustomerId(customerId);
        userRepository.save(user);
        return customerId;
    }

    public Subscription cancelSubscription(Long userId) {
        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getPaddleSubscriptionId() == null) {
            throw new RuntimeException("No Paddle subscription found");
        }

        if (!isBlockingStatus(subscription.getStatus())) {
            throw new RuntimeException("No active subscription to cancel");
        }

        if (Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd()) || subscription.getCancelledAt() != null) {
            throw new RuntimeException("Subscription is already scheduled for cancellation");
        }

        JsonNode response = apiClient.cancelSubscription(subscription.getPaddleSubscriptionId());
        applyPaddleSubscription(subscription, response);
        subscriptionRepository.save(subscription);
        log.info("Subscription scheduled for cancellation for user {}", userId);
        return subscription;
    }

    public Subscription reactivateSubscription(Long userId) {
        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getPaddleSubscriptionId() == null) {
            throw new RuntimeException("No Paddle subscription found");
        }

        if (!Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd())
                && subscription.getCancelledAt() == null) {
            throw new RuntimeException("Subscription is not scheduled for cancellation");
        }

        if (!hasProAccess(subscription)) {
            throw new RuntimeException("Subscription cannot be reactivated");
        }

        JsonNode response = apiClient.removeScheduledChange(subscription.getPaddleSubscriptionId());
        applyPaddleSubscription(subscription, response);
        subscription.setCancelledAt(null);
        subscription.setCancelAtPeriodEnd(false);
        subscriptionRepository.save(subscription);
        log.info("Subscription reactivated for user {}", userId);
        return subscription;
    }

    public Subscription upgradeSubscription(Long userId, String targetPriceId) {
        if (!priceIdYearly.equals(targetPriceId)) {
            throw new RuntimeException("Only upgrade to yearly plan is supported");
        }

        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getPaddleSubscriptionId() == null) {
            throw new RuntimeException("No Paddle subscription found");
        }

        if (Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd()) || subscription.getCancelledAt() != null) {
            throw new RuntimeException("Reactivate your subscription before upgrading");
        }

        if (!isBlockingStatus(subscription.getStatus())) {
            throw new RuntimeException("No active subscription to upgrade");
        }

        if (targetPriceId.equals(subscription.getPlanId())) {
            throw new RuntimeException("You are already on this plan");
        }

        if (!priceIdMonthly.equals(subscription.getPlanId())) {
            throw new RuntimeException("Upgrade is only available from monthly to yearly");
        }

        JsonNode response = apiClient.updateSubscriptionItems(
                subscription.getPaddleSubscriptionId(),
                targetPriceId
        );
        applyPaddleSubscription(subscription, response);
        subscriptionRepository.save(subscription);
        log.info("Subscription upgraded to yearly for user {}", userId);
        return subscription;
    }

    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return false;
        }
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.error("Paddle webhook secret is not configured");
            return false;
        }

        try {
            Map<String, String> parts = parseSignatureHeader(signatureHeader);
            String timestamp = parts.get("ts");
            String signature = parts.get("h1");
            if (timestamp == null || signature == null) {
                return false;
            }

            String signedPayload = timestamp + ":" + payload;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
            String expected = HexFormat.of().formatHex(digest);

            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception e) {
            log.error("Webhook signature verification failed: {}", e.getMessage());
            return false;
        }
    }

    @Transactional
    public void handleWebhook(String payload, String signatureHeader) {
        if (!verifyWebhookSignature(payload, signatureHeader)) {
            throw new SecurityException("Invalid webhook signature");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (Exception e) {
            throw new RuntimeException("Invalid webhook payload", e);
        }

        String eventId = root.path("event_id").asText();
        String eventType = root.path("event_type").asText();
        if (eventId.isBlank() || eventType.isBlank()) {
            throw new RuntimeException("Missing event_id or event_type in webhook payload");
        }

        PaddleEvent event = eventRepository.findByEventId(eventId).orElseGet(() -> {
            PaddleEvent record = new PaddleEvent();
            record.setEventId(eventId);
            record.setEventType(eventType);
            record.setPayload(payload);
            record.setProcessed(false);
            return eventRepository.save(record);
        });

        if (event.isProcessed()) {
            return;
        }

        try {
            processEvent(root, eventType);
            event.setProcessed(true);
            event.setProcessedAt(LocalDateTime.now());
            event.setErrorMessage(null);
        } catch (Exception e) {
            log.error("Failed to process Paddle event {}: {}", eventType, e.getMessage(), e);
            event.setProcessed(false);
            event.setErrorMessage(e.getMessage());
            eventRepository.save(event);
            throw e;
        }

        eventRepository.save(event);
    }

    private Map<String, String> parseSignatureHeader(String signatureHeader) {
        java.util.HashMap<String, String> parts = new java.util.HashMap<>();
        for (String part : signatureHeader.split("[,;]")) {
            String[] keyValue = part.split("=", 2);
            if (keyValue.length == 2) {
                parts.put(keyValue[0].trim(), keyValue[1].trim());
            }
        }
        return parts;
    }

    private void processEvent(JsonNode root, String eventType) {
        if (SUBSCRIPTION_EVENTS.contains(eventType)) {
            handleSubscriptionEvent(root, eventType);
            return;
        }

        if ("transaction.completed".equals(eventType) || "transaction.paid".equals(eventType)) {
            handleTransactionEvent(root);
            return;
        }

        log.info("Unhandled Paddle event type: {}", eventType);
    }

    private void handleSubscriptionEvent(JsonNode root, String eventType) {
        JsonNode data = root.path("data");
        if (data.isMissingNode() || data.isEmpty()) {
            log.warn("Missing data for event {}", eventType);
            return;
        }

        User user = resolveUser(root, data);
        if (user == null) {
            throw new RuntimeException("No user mapping found for Paddle event " + eventType);
        }

        String customerId = data.path("customer_id").asText(null);
        if (customerId != null && !customerId.isBlank()) {
            user.setPaddleCustomerId(customerId);
            userRepository.save(user);
        }

        upsertSubscription(user, data);
    }

    private void handleTransactionEvent(JsonNode root) {
        JsonNode data = root.path("data");
        if (data.isMissingNode() || data.isEmpty()) {
            return;
        }

        String subscriptionId = data.path("subscription_id").asText(null);
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return;
        }

        User user = resolveUser(root, data);
        if (user == null) {
            throw new RuntimeException("No user mapping found for Paddle transaction event");
        }

        try {
            JsonNode subscriptionData = apiClient.getSubscription(subscriptionId);
            upsertSubscription(user, subscriptionData);
        } catch (Exception e) {
            log.warn("Could not fetch subscription {} after transaction: {}", subscriptionId, e.getMessage());
        }
    }

    private User resolveUser(JsonNode root, JsonNode data) {
        JsonNode customData = data.path("custom_data");
        if (customData.hasNonNull("user_id")) {
            Long userId = Long.parseLong(customData.get("user_id").asText());
            User user = userRepository.findById(userId).orElse(null);
            if (user != null) {
                return user;
            }
        }

        String subscriptionId = data.path("id").asText(null);
        if (subscriptionId != null && subscriptionId.startsWith("sub_")) {
            Subscription subscription = subscriptionRepository
                    .findByPaddleSubscriptionId(subscriptionId)
                    .orElse(null);
            if (subscription != null) {
                return subscription.getUser();
            }
        }

        String linkedSubscriptionId = data.path("subscription_id").asText(null);
        if (linkedSubscriptionId != null && !linkedSubscriptionId.isBlank()) {
            Subscription subscription = subscriptionRepository
                    .findByPaddleSubscriptionId(linkedSubscriptionId)
                    .orElse(null);
            if (subscription != null) {
                return subscription.getUser();
            }
        }

        String customerId = data.path("customer_id").asText(null);
        if (customerId != null && !customerId.isBlank()) {
            User user = userRepository.findByPaddleCustomerId(customerId).orElse(null);
            if (user != null) {
                return user;
            }
        }

        return null;
    }

    private void upsertSubscription(User user, JsonNode data) {
        Subscription subscription = subscriptionRepository.findByUserId(user.getId())
                .orElseGet(Subscription::new);

        subscription.setUser(user);
        applyPaddleSubscription(subscription, data);
        subscriptionRepository.save(subscription);
        log.info("Subscription saved for user {} status {}", user.getEmail(), subscription.getStatus());
    }

    private void applyPaddleSubscription(Subscription subscription, JsonNode data) {
        subscription.setPaddleSubscriptionId(data.path("id").asText(null));
        subscription.setPlanId(extractPriceId(data));

        String status = data.path("status").asText();
        boolean scheduledCancel = isScheduledForCancellation(data);
        subscription.setStatus(mapPaddleStatus(status, scheduledCancel));

        String periodEnd = data.path("current_billing_period").path("ends_at").asText(null);
        if (periodEnd != null && !periodEnd.isBlank()) {
            subscription.setCurrentPeriodEnd(parseDateTime(periodEnd));
        }

        subscription.setCancelAtPeriodEnd(
                scheduledCancel && subscription.getStatus() != SubscriptionStatus.CANCELLED
        );

        if (scheduledCancel || "canceled".equals(status)) {
            if (subscription.getCancelledAt() == null && "canceled".equals(status)) {
                subscription.setCancelledAt(LocalDateTime.now());
            }
        } else if (subscription.getStatus() != SubscriptionStatus.CANCELLED) {
            subscription.setCancelledAt(null);
        }
    }

    private String extractPriceId(JsonNode data) {
        JsonNode items = data.path("items");
        if (items.isArray() && !items.isEmpty()) {
            String priceId = items.get(0).path("price").path("id").asText(null);
            if (priceId != null && !priceId.isBlank()) {
                return priceId;
            }
            priceId = items.get(0).path("price_id").asText(null);
            if (priceId != null && !priceId.isBlank()) {
                return priceId;
            }
        }
        return null;
    }

    private boolean isScheduledForCancellation(JsonNode data) {
        JsonNode scheduledChange = data.path("scheduled_change");
        if (scheduledChange.isMissingNode() || scheduledChange.isNull()) {
            return false;
        }
        return "cancel".equals(scheduledChange.path("action").asText());
    }

    private SubscriptionStatus mapPaddleStatus(String status, boolean scheduledCancel) {
        if ("canceled".equals(status) && !scheduledCancel) {
            return SubscriptionStatus.CANCELLED;
        }
        return switch (status) {
            case "active", "canceled" -> SubscriptionStatus.ACTIVE;
            case "trialing" -> SubscriptionStatus.TRIAL;
            case "past_due" -> SubscriptionStatus.PAST_DUE;
            case "paused" -> SubscriptionStatus.ACTIVE;
            default -> scheduledCancel ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED;
        };
    }

    private LocalDateTime parseDateTime(String value) {
        return LocalDateTime.ofInstant(
                Instant.from(DateTimeFormatter.ISO_DATE_TIME.parse(value)),
                ZoneOffset.UTC
        );
    }

    private void ensureCheckoutPageConfigured() {
        if (isBlankConfig(checkoutPageUrl)) {
            throw new RuntimeException(
                    "Paddle checkout page is not configured. "
                            + "Set paddle.checkout-url to your /checkout/pay page and match it in "
                            + "Paddle Dashboard > Checkout > Default payment link."
            );
        }
    }

    private boolean isBlankConfig(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        return isMissingConfig(value);
    }

    private void ensurePaddleConfigured() {
        if (isMissingConfig(apiKey) || isMissingConfig(priceIdMonthly) || isMissingConfig(priceIdYearly)) {
            throw new RuntimeException(
                    "Paddle is not configured. Set paddle.api-key and price IDs, then restart the backend."
            );
        }
    }

    private boolean isMissingConfig(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        String normalized = value.trim().toLowerCase();
        return normalized.startsWith("replace_with")
                || normalized.startsWith("your_")
                || normalized.equals("...");
    }

    private void ensureNoActiveSubscription(Long userId) {
        Optional<Subscription> subscriptionOpt = subscriptionRepository.findByUserId(userId);
        if (subscriptionOpt.isEmpty()) {
            return;
        }

        Subscription subscription = subscriptionOpt.get();
        if (hasProAccess(subscription)) {
            throw new ActiveSubscriptionException("You already have an active subscription");
        }
    }

    private boolean isBlockingStatus(SubscriptionStatus status) {
        return status == SubscriptionStatus.ACTIVE
                || status == SubscriptionStatus.TRIAL
                || status == SubscriptionStatus.PAST_DUE;
    }

    private boolean hasProAccess(Subscription subscription) {
        if (isBlockingStatus(subscription.getStatus())) {
            return true;
        }
        return isInCancelGracePeriod(subscription);
    }

    private boolean isInCancelGracePeriod(Subscription subscription) {
        if (!Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd())
                && subscription.getCancelledAt() == null) {
            return false;
        }
        LocalDateTime periodEnd = subscription.getCurrentPeriodEnd();
        return periodEnd != null && periodEnd.isAfter(LocalDateTime.now());
    }
}
