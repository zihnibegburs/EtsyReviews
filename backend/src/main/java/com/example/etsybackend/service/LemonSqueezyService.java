package com.example.etsybackend.service;

import com.example.etsybackend.client.LemonSqueezyApiClient;
import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.LemonSqueezyEvent;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.model.SubscriptionStatus;
import com.example.etsybackend.model.User;
import com.example.etsybackend.model.LemonSqueezyPayment;
import com.example.etsybackend.repository.LemonSqueezyEventRepository;
import com.example.etsybackend.repository.LemonSqueezyPaymentRepository;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class LemonSqueezyService {
    private static final Logger log = LoggerFactory.getLogger(LemonSqueezyService.class);
    private static final Set<String> SUBSCRIPTION_EVENTS = Set.of(
            "subscription_created",
            "subscription_updated",
            "subscription_cancelled",
            "subscription_expired",
            "subscription_resumed"
    );

    private static final Set<String> PAYMENT_EVENTS = Set.of(
            "order_created",
            "subscription_payment_success",
            "subscription_payment_recovered"
    );

    @Value("${lemonsqueezy.api-key}")
    private String apiKey;

    @Value("${lemonsqueezy.store-id}")
    private String storeId;

    @Value("${lemonsqueezy.webhook-secret}")
    private String webhookSecret;

    @Value("${lemonsqueezy.variant-id-monthly}")
    private String variantIdMonthly;

    @Value("${lemonsqueezy.variant-id-yearly}")
    private String variantIdYearly;

    @Value("${lemonsqueezy.success-url}")
    private String successUrl;

    private final LemonSqueezyApiClient apiClient;
    private final ObjectMapper objectMapper;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final LemonSqueezyEventRepository eventRepository;
    private final LemonSqueezyPaymentRepository paymentRepository;

    public LemonSqueezyService(
            LemonSqueezyApiClient apiClient,
            ObjectMapper objectMapper,
            SubscriptionRepository subscriptionRepository,
            UserRepository userRepository,
            LemonSqueezyEventRepository eventRepository,
            LemonSqueezyPaymentRepository paymentRepository
    ) {
        this.apiClient = apiClient;
        this.objectMapper = objectMapper;
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
        this.paymentRepository = paymentRepository;
    }

    @PostConstruct
    void logConfigStatus() {
        if (isMissingConfig(apiKey) || isMissingConfig(storeId)
                || isMissingConfig(variantIdMonthly) || isMissingConfig(variantIdYearly)) {
            log.warn(
                    "Lemon Squeezy config is incomplete in application-local.properties. "
                            + "Checkout will fail until api-key, store-id, and variant IDs are set."
            );
        }
    }

    public String createCheckoutUrl(Long userId, String email, String variantId) {
        ensureLemonSqueezyConfigured();
        ensureNoActiveSubscription(userId);

        JsonNode response = apiClient.createCheckout(storeId, variantId, email, userId, successUrl);
        JsonNode url = response.path("data").path("attributes").path("url");
        if (url.isMissingNode() || url.asText().isBlank()) {
            throw new RuntimeException("Checkout URL missing from Lemon Squeezy response");
        }
        return url.asText();
    }

    public Subscription cancelSubscription(Long userId) {
        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getLemonsqueezySubscriptionId() == null) {
            throw new RuntimeException("No Lemon Squeezy subscription found");
        }

        if (!isBlockingStatus(subscription.getStatus())) {
            throw new RuntimeException("No active subscription to cancel");
        }

        if (Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd()) || subscription.getCancelledAt() != null) {
            throw new RuntimeException("Subscription is already scheduled for cancellation");
        }

        ObjectNode attributes = objectMapper.createObjectNode();
        attributes.put("cancelled", true);

        JsonNode response = apiClient.updateSubscription(
                subscription.getLemonsqueezySubscriptionId(),
                attributes
        );
        applyLemonSqueezySubscription(subscription, response.path("data"));
        subscription.setCancelledAt(LocalDateTime.now());
        subscriptionRepository.save(subscription);
        log.info("Subscription scheduled for cancellation for user {}", userId);
        return subscription;
    }

    public Subscription reactivateSubscription(Long userId) {
        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getLemonsqueezySubscriptionId() == null) {
            throw new RuntimeException("No Lemon Squeezy subscription found");
        }

        if (!Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd())
                && subscription.getCancelledAt() == null) {
            throw new RuntimeException("Subscription is not scheduled for cancellation");
        }

        if (!hasProAccess(subscription)) {
            throw new RuntimeException("Subscription cannot be reactivated");
        }

        ObjectNode attributes = objectMapper.createObjectNode();
        attributes.put("cancelled", false);

        JsonNode response = apiClient.updateSubscription(
                subscription.getLemonsqueezySubscriptionId(),
                attributes
        );
        applyLemonSqueezySubscription(subscription, response.path("data"));
        subscription.setCancelledAt(null);
        subscription.setCancelAtPeriodEnd(false);
        subscriptionRepository.save(subscription);
        log.info("Subscription reactivated for user {}", userId);
        return subscription;
    }

    public Subscription upgradeSubscription(Long userId, String targetVariantId) {
        if (!variantIdYearly.equals(targetVariantId)) {
            throw new RuntimeException("Only upgrade to yearly plan is supported");
        }

        Subscription subscription = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("No subscription found"));

        if (subscription.getLemonsqueezySubscriptionId() == null) {
            throw new RuntimeException("No Lemon Squeezy subscription found");
        }

        if (Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd()) || subscription.getCancelledAt() != null) {
            throw new RuntimeException("Reactivate your subscription before upgrading");
        }

        if (!isBlockingStatus(subscription.getStatus())) {
            throw new RuntimeException("No active subscription to upgrade");
        }

        if (targetVariantId.equals(subscription.getPlanId())) {
            throw new RuntimeException("You are already on this plan");
        }

        if (!variantIdMonthly.equals(subscription.getPlanId())) {
            throw new RuntimeException("Upgrade is only available from monthly to yearly");
        }

        ObjectNode attributes = objectMapper.createObjectNode();
        attributes.put("variant_id", Integer.parseInt(targetVariantId));

        JsonNode response = apiClient.updateSubscription(
                subscription.getLemonsqueezySubscriptionId(),
                attributes
        );
        applyLemonSqueezySubscription(subscription, response.path("data"));
        subscriptionRepository.save(subscription);
        log.info("Subscription upgraded to yearly for user {}", userId);
        return subscription;
    }

    public boolean verifyWebhookSignature(String payload, String signature) {
        if (signature == null || signature.isBlank()) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
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
    public void handleWebhook(String payload, String signature) {
        if (!verifyWebhookSignature(payload, signature)) {
            throw new SecurityException("Invalid webhook signature");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (Exception e) {
            throw new RuntimeException("Invalid webhook payload", e);
        }

        String eventName = root.path("meta").path("event_name").asText();
        String eventId = buildEventId(root, eventName);

        LemonSqueezyEvent event = eventRepository.findByEventId(eventId).orElseGet(() -> {
            LemonSqueezyEvent record = new LemonSqueezyEvent();
            record.setEventId(eventId);
            record.setEventType(eventName);
            record.setPayload(payload);
            record.setProcessed(false);
            return eventRepository.save(record);
        });

        if (event.isProcessed()) {
            return;
        }

        try {
            processEvent(root, eventName);
            event.setProcessed(true);
            event.setProcessedAt(LocalDateTime.now());
            event.setErrorMessage(null);
        } catch (Exception e) {
            log.error("Failed to process Lemon Squeezy event {}: {}", eventName, e.getMessage(), e);
            event.setProcessed(false);
            event.setErrorMessage(e.getMessage());
            eventRepository.save(event);
            throw e;
        }

        eventRepository.save(event);
    }

    @Transactional
    public long backfillPaymentsFromStoredEvents() {
        long initialCount = paymentRepository.count();
        List<LemonSqueezyEvent> events = eventRepository.findAll().stream()
                .sorted(Comparator.comparing(LemonSqueezyEvent::getCreatedAt))
                .toList();

        for (LemonSqueezyEvent event : events) {
            try {
                JsonNode root = objectMapper.readTree(event.getPayload());
                String eventName = event.getEventType();

                if (PAYMENT_EVENTS.contains(eventName)) {
                    handlePaymentEvent(root, eventName);
                } else if ("subscription_created".equals(eventName)) {
                    JsonNode data = root.path("data");
                    User user = resolveUser(root, data);
                    if (user != null) {
                        saveInitialPaymentFromSubscription(user, data);
                    }
                }
            } catch (Exception e) {
                log.warn("Backfill skipped event {}: {}", event.getEventId(), e.getMessage());
            }
        }

        return paymentRepository.count() - initialCount;
    }

    private String buildEventId(JsonNode root, String eventName) {
        String dataId = root.path("data").path("id").asText();
        String updatedAt = root.path("data").path("attributes").path("updated_at").asText("");
        return eventName + ":" + dataId + ":" + updatedAt;
    }

    private void processEvent(JsonNode root, String eventName) {
        if (SUBSCRIPTION_EVENTS.contains(eventName)) {
            handleSubscriptionEvent(root, eventName);
            return;
        }

        if (PAYMENT_EVENTS.contains(eventName)) {
            handlePaymentEvent(root, eventName);
            return;
        }

        log.info("Unhandled Lemon Squeezy event type: {}", eventName);
    }

    private void handleSubscriptionEvent(JsonNode root, String eventName) {
        JsonNode data = root.path("data");
        if (!"subscriptions".equals(data.path("type").asText())) {
            log.warn("Expected subscription data for event {}", eventName);
            return;
        }

        User user = resolveUser(root, data);
        if (user == null) {
            throw new RuntimeException("No user mapping found for Lemon Squeezy event " + eventName);
        }

        String customerId = data.path("attributes").path("customer_id").asText(null);
        if (customerId != null && !customerId.isBlank()) {
            user.setLemonsqueezyCustomerId(customerId);
            userRepository.save(user);
        }

        upsertSubscription(user, data);

        if ("subscription_created".equals(eventName)) {
            saveInitialPaymentFromSubscription(user, data);
        }

        if ("subscription_expired".equals(eventName)) {
            subscriptionRepository.findByLemonsqueezySubscriptionId(data.path("id").asText())
                    .ifPresent(subscription -> {
                        subscription.setStatus(SubscriptionStatus.CANCELLED);
                        subscription.setCancelledAt(LocalDateTime.now());
                        subscriptionRepository.save(subscription);
                    });
        }
    }

    private void handlePaymentEvent(JsonNode root, String eventName) {
        JsonNode data = root.path("data");
        String dataType = data.path("type").asText();

        if ("orders".equals(dataType)) {
            User user = resolveUser(root, data);
            if (user == null) {
                throw new RuntimeException("No user mapping found for Lemon Squeezy event " + eventName);
            }
            savePaymentFromOrder(data, user);
            return;
        }

        if ("subscription-invoices".equals(dataType)) {
            User user = resolveUserForInvoice(root, data);
            if (user == null) {
                throw new RuntimeException("No user mapping found for Lemon Squeezy event " + eventName);
            }
            savePaymentFromInvoice(data, user);
            return;
        }

        log.warn("Unexpected data type {} for payment event {}", dataType, eventName);
    }

    private void saveInitialPaymentFromSubscription(User user, JsonNode subscriptionData) {
        String orderId = subscriptionData.path("attributes").path("order_id").asText(null);
        if (orderId == null || orderId.isBlank()) {
            return;
        }
        if (paymentRepository.findByOrderId(orderId).isPresent()) {
            return;
        }

        try {
            JsonNode orderResponse = apiClient.getOrder(orderId);
            JsonNode orderData = orderResponse.path("data");
            if (orderData.isMissingNode() || orderData.isEmpty()) {
                log.warn("Could not fetch order {} for subscription {}", orderId, subscriptionData.path("id").asText());
                return;
            }
            savePaymentFromOrder(orderData, user);
        } catch (Exception e) {
            log.warn("Failed to fetch order {} for subscription payment: {}", orderId, e.getMessage());
        }
    }

    private void savePaymentFromOrder(JsonNode orderData, User user) {
        String orderId = orderData.path("id").asText(null);
        if (orderId == null || orderId.isBlank()) {
            return;
        }
        if (paymentRepository.findByOrderId(orderId).isPresent()) {
            return;
        }

        JsonNode attributes = orderData.path("attributes");
        String status = attributes.path("status").asText(null);
        if (status != null && !"paid".equals(status)) {
            log.info("Skipping unpaid order {}", orderId);
            return;
        }

        LemonSqueezyPayment payment = new LemonSqueezyPayment();
        payment.setUserId(user.getId());
        payment.setOrderId(orderId);
        payment.setCustomerId(attributes.path("customer_id").asText(null));
        payment.setCustomerEmail(attributes.path("user_email").asText(user.getEmail()));
        payment.setTotal(attributes.path("total").asLong(0));
        payment.setCurrency(attributes.path("currency").asText(null));
        payment.setStatus(status);

        String subscriptionId = findRelatedSubscriptionId(orderData);
        if (subscriptionId != null) {
            payment.setSubscriptionId(subscriptionId);
        }

        paymentRepository.save(payment);
        log.info("Payment saved for order {} user {}", orderId, user.getEmail());
    }

    private void savePaymentFromInvoice(JsonNode invoiceData, User user) {
        String invoiceId = invoiceData.path("id").asText(null);
        if (invoiceId == null || invoiceId.isBlank()) {
            return;
        }
        if (paymentRepository.findByInvoiceId(invoiceId).isPresent()) {
            return;
        }

        JsonNode attributes = invoiceData.path("attributes");
        String status = attributes.path("status").asText(null);
        if (status != null && !"paid".equals(status)) {
            log.info("Skipping unpaid invoice {}", invoiceId);
            return;
        }

        LemonSqueezyPayment payment = new LemonSqueezyPayment();
        payment.setUserId(user.getId());
        payment.setInvoiceId(invoiceId);
        payment.setSubscriptionId(String.valueOf(attributes.path("subscription_id").asLong()));
        payment.setCustomerId(String.valueOf(attributes.path("customer_id").asLong()));
        payment.setCustomerEmail(attributes.path("user_email").asText(user.getEmail()));
        payment.setTotal(attributes.path("total").asLong(0));
        payment.setCurrency(attributes.path("currency").asText(null));
        payment.setStatus(status);

        paymentRepository.save(payment);
        log.info("Payment saved for invoice {} user {}", invoiceId, user.getEmail());
    }

    private String findRelatedSubscriptionId(JsonNode orderData) {
        JsonNode firstItem = orderData.path("attributes").path("first_order_item");
        if (firstItem.hasNonNull("subscription_id")) {
            return String.valueOf(firstItem.path("subscription_id").asLong());
        }
        return null;
    }

    private User resolveUserForInvoice(JsonNode root, JsonNode invoiceData) {
        JsonNode customData = root.path("meta").path("custom_data");
        if (customData.hasNonNull("user_id")) {
            Long userId = Long.parseLong(customData.get("user_id").asText());
            User user = userRepository.findById(userId).orElse(null);
            if (user != null) {
                return user;
            }
        }

        String subscriptionId = String.valueOf(invoiceData.path("attributes").path("subscription_id").asLong());
        if (!subscriptionId.equals("0")) {
            Subscription subscription = subscriptionRepository
                    .findByLemonsqueezySubscriptionId(subscriptionId)
                    .orElse(null);
            if (subscription != null) {
                return subscription.getUser();
            }
        }

        String customerId = String.valueOf(invoiceData.path("attributes").path("customer_id").asLong());
        if (!customerId.equals("0")) {
            User user = userRepository.findByLemonsqueezyCustomerId(customerId).orElse(null);
            if (user != null) {
                return user;
            }
        }

        String email = invoiceData.path("attributes").path("user_email").asText(null);
        if (email != null) {
            return userRepository.findByEmail(email).orElse(null);
        }

        return null;
    }

    private User resolveUser(JsonNode root, JsonNode data) {
        JsonNode customData = root.path("meta").path("custom_data");
        if (customData.hasNonNull("user_id")) {
            Long userId = Long.parseLong(customData.get("user_id").asText());
            User user = userRepository.findById(userId).orElse(null);
            if (user != null) {
                return user;
            }
        }

        String subscriptionId = data.path("id").asText(null);
        if (subscriptionId != null) {
            Subscription subscription = subscriptionRepository
                    .findByLemonsqueezySubscriptionId(subscriptionId)
                    .orElse(null);
            if (subscription != null) {
                return subscription.getUser();
            }
        }

        String customerId = data.path("attributes").path("customer_id").asText(null);
        if (customerId != null) {
            return userRepository.findByLemonsqueezyCustomerId(customerId).orElse(null);
        }

        String email = data.path("attributes").path("user_email").asText(null);
        if (email != null) {
            return userRepository.findByEmail(email).orElse(null);
        }

        return null;
    }

    private void upsertSubscription(User user, JsonNode data) {
        Subscription subscription = subscriptionRepository.findByUserId(user.getId())
                .orElseGet(Subscription::new);

        subscription.setUser(user);
        applyLemonSqueezySubscription(subscription, data);
        subscriptionRepository.save(subscription);
        log.info("Subscription saved for user {} status {}", user.getEmail(), subscription.getStatus());
    }

    private void applyLemonSqueezySubscription(Subscription subscription, JsonNode data) {
        JsonNode attributes = data.path("attributes");

        subscription.setLemonsqueezySubscriptionId(data.path("id").asText(null));
        subscription.setPlanId(String.valueOf(attributes.path("variant_id").asInt()));

        String status = attributes.path("status").asText();
        boolean cancelled = attributes.path("cancelled").asBoolean(false);
        subscription.setStatus(mapLemonSqueezyStatus(status, cancelled));

        String renewsAt = attributes.path("renews_at").asText(null);
        String endsAt = attributes.path("ends_at").asText(null);

        if (renewsAt != null && !renewsAt.isBlank()) {
            subscription.setCurrentPeriodEnd(parseDateTime(renewsAt));
        } else if (endsAt != null && !endsAt.isBlank()) {
            subscription.setCurrentPeriodEnd(parseDateTime(endsAt));
        }

        subscription.setCancelAtPeriodEnd(
                cancelled && subscription.getStatus() != SubscriptionStatus.CANCELLED
        );

        if (cancelled) {
            if (subscription.getCancelledAt() == null) {
                subscription.setCancelledAt(LocalDateTime.now());
            }
        } else if (subscription.getStatus() != SubscriptionStatus.CANCELLED) {
            subscription.setCancelledAt(null);
        }
    }

    private SubscriptionStatus mapLemonSqueezyStatus(String status, boolean cancelled) {
        if ("expired".equals(status)) {
            return SubscriptionStatus.CANCELLED;
        }
        // Lemon Squeezy keeps status "cancelled" during the grace period; access continues until ends_at.
        if ("cancelled".equals(status)) {
            return SubscriptionStatus.ACTIVE;
        }
        return switch (status) {
            case "active" -> SubscriptionStatus.ACTIVE;
            case "on_trial" -> SubscriptionStatus.TRIAL;
            case "past_due", "unpaid" -> SubscriptionStatus.PAST_DUE;
            case "paused" -> SubscriptionStatus.ACTIVE;
            default -> cancelled ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED;
        };
    }

    private LocalDateTime parseDateTime(String value) {
        return LocalDateTime.ofInstant(
                Instant.from(DateTimeFormatter.ISO_DATE_TIME.parse(value)),
                ZoneOffset.UTC
        );
    }

    private void ensureLemonSqueezyConfigured() {
        if (isMissingConfig(apiKey) || isMissingConfig(storeId)
                || isMissingConfig(variantIdMonthly) || isMissingConfig(variantIdYearly)) {
            throw new RuntimeException(
                    "Lemon Squeezy is not configured. Set lemonsqueezy.api-key, store-id, "
                            + "and variant IDs in application-local.properties, then restart the backend."
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
