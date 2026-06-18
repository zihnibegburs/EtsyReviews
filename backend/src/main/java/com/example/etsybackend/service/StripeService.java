package com.example.etsybackend.service;

import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.StripeEvent;
import com.example.etsybackend.model.StripePayment;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.model.SubscriptionStatus;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.StripeEventRepository;
import com.example.etsybackend.repository.StripePaymentRepository;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.Invoice;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.param.checkout.SessionCreateParams;
import com.stripe.param.checkout.SessionRetrieveParams;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;

@Service
public class StripeService {
    private static final Logger log = LoggerFactory.getLogger(StripeService.class);

    @Value("${stripe.secret-key}")
    private String secretKey;

    @Value("${stripe.success-url}")
    private String successUrl;

    @Value("${stripe.cancel-url}")
    private String cancelUrl;

    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final StripeEventRepository stripeEventRepository;
    private final StripePaymentRepository stripePaymentRepository;

    public StripeService(
            SubscriptionRepository subscriptionRepository,
            UserRepository userRepository,
            StripeEventRepository stripeEventRepository,
            StripePaymentRepository stripePaymentRepository
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.stripeEventRepository = stripeEventRepository;
        this.stripePaymentRepository = stripePaymentRepository;
    }

    @PostConstruct
    void init() {
        Stripe.apiKey = secretKey;
    }

    public Session createCheckoutSession(Long userId, String email, String priceId) throws StripeException {
        ensureNoActiveSubscription(userId);

        SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .setClientReferenceId(userId.toString())
                .putMetadata("user_id", userId.toString())
                .addLineItem(
                        SessionCreateParams.LineItem.builder()
                                .setPrice(priceId)
                                .setQuantity(1L)
                                .build()
                )
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl);

        User user = userRepository.findById(userId).orElse(null);
        if (user != null && user.getStripeCustomerId() != null) {
            paramsBuilder.setCustomer(user.getStripeCustomerId());
        } else {
            paramsBuilder.setCustomerEmail(email);
        }

        return Session.create(paramsBuilder.build());
    }

    private void ensureNoActiveSubscription(Long userId) {
        subscriptionRepository.findByUserId(userId).ifPresent(subscription -> {
            if (subscription.getStatus() == SubscriptionStatus.ACTIVE
                    || subscription.getStatus() == SubscriptionStatus.TRIAL
                    || subscription.getStatus() == SubscriptionStatus.PAST_DUE) {
                throw new ActiveSubscriptionException("You already have an active subscription");
            }
        });
    }

    @Transactional
    public void handleWebhook(Event event, String rawPayload) throws StripeException {
        StripeEvent stripeEvent = saveIncomingEvent(event, rawPayload);

        try {
            processEvent(event);
            stripeEvent.setProcessed(true);
            stripeEvent.setProcessedAt(LocalDateTime.now());
            stripeEvent.setErrorMessage(null);
        } catch (Exception e) {
            log.error("Failed to process Stripe event {}: {}", event.getId(), e.getMessage(), e);
            stripeEvent.setProcessed(false);
            stripeEvent.setErrorMessage(e.getMessage());
            stripeEventRepository.save(stripeEvent);
            throw e;
        }

        stripeEventRepository.save(stripeEvent);
    }

    private StripeEvent saveIncomingEvent(Event event, String rawPayload) {
        return stripeEventRepository.findByStripeEventId(event.getId()).orElseGet(() -> {
            StripeEvent stripeEvent = new StripeEvent();
            stripeEvent.setStripeEventId(event.getId());
            stripeEvent.setEventType(event.getType());
            stripeEvent.setPayload(rawPayload);
            stripeEvent.setProcessed(false);
            return stripeEventRepository.save(stripeEvent);
        });
    }

    private void processEvent(Event event) throws StripeException {
        StripeObject stripeObject = deserializeEventObject(event);
        if (stripeObject == null) {
            log.warn("Could not deserialize Stripe object for event {}", event.getType());
            return;
        }

        switch (event.getType()) {
            case "checkout.session.completed" -> {
                if (stripeObject instanceof Session session) {
                    handleCheckoutCompleted(session);
                }
            }
            case "customer.subscription.created", "customer.subscription.updated" -> {
                if (stripeObject instanceof com.stripe.model.Subscription stripeSubscription) {
                    handleSubscriptionUpdated(stripeSubscription);
                }
            }
            case "customer.subscription.deleted" -> {
                if (stripeObject instanceof com.stripe.model.Subscription stripeSubscription) {
                    handleSubscriptionDeleted(stripeSubscription);
                }
            }
            case "invoice.paid" -> {
                if (stripeObject instanceof Invoice invoice) {
                    handleInvoicePaid(invoice);
                }
            }
            default -> log.info("Unhandled Stripe event type: {}", event.getType());
        }
    }

    private StripeObject deserializeEventObject(Event event) {
        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        if (deserializer.getObject().isPresent()) {
            return deserializer.getObject().get();
        }
        try {
            return deserializer.deserializeUnsafe();
        } catch (Exception e) {
            log.error("deserializeUnsafe failed for {}: {}", event.getType(), e.getMessage());
            return null;
        }
    }

    private void handleCheckoutCompleted(Session session) throws StripeException {
        Session fullSession = Session.retrieve(
                session.getId(),
                SessionRetrieveParams.builder()
                        .addExpand("subscription")
                        .addExpand("line_items")
                        .build(),
                null
        );

        User user = resolveUser(fullSession);
        if (user == null) {
            throw new RuntimeException("No user mapping found for checkout session " + fullSession.getId());
        }

        savePaymentFromSession(fullSession, user);

        String customerId = fullSession.getCustomer();
        if (customerId != null) {
            user.setStripeCustomerId(customerId);
            userRepository.save(user);
        }

        String subscriptionId = fullSession.getSubscription();
        if (subscriptionId == null) {
            log.warn("Checkout session {} completed without subscription id", fullSession.getId());
            return;
        }

        com.stripe.model.Subscription stripeSubscription =
                com.stripe.model.Subscription.retrieve(subscriptionId);
        upsertSubscription(user, stripeSubscription);
    }

    private void savePaymentFromSession(Session session, User user) {
        if (stripePaymentRepository.findByStripeSessionId(session.getId()).isPresent()) {
            return;
        }

        StripePayment payment = new StripePayment();
        payment.setUserId(user.getId());
        payment.setStripeSessionId(session.getId());
        payment.setStripePaymentIntentId(session.getPaymentIntent());
        payment.setStripeSubscriptionId(session.getSubscription());
        payment.setStripeCustomerId(session.getCustomer());
        payment.setAmountTotal(session.getAmountTotal());
        payment.setCurrency(session.getCurrency());
        payment.setStatus(session.getPaymentStatus());
        payment.setCustomerEmail(session.getCustomerDetails() != null
                ? session.getCustomerDetails().getEmail()
                : session.getCustomerEmail());

        Map<String, String> metadata = session.getMetadata();
        if (metadata != null && metadata.containsKey("price_id")) {
            payment.setPriceId(metadata.get("price_id"));
        } else if (session.getLineItems() != null
                && session.getLineItems().getData() != null
                && !session.getLineItems().getData().isEmpty()) {
            payment.setPriceId(session.getLineItems().getData().get(0).getPrice().getId());
        }

        stripePaymentRepository.save(payment);
    }

    private void handleInvoicePaid(Invoice invoice) throws StripeException {
        if (invoice.getSubscription() == null) {
            return;
        }

        com.stripe.model.Subscription stripeSubscription =
                com.stripe.model.Subscription.retrieve(invoice.getSubscription());

        User user = userRepository.findByStripeCustomerId(invoice.getCustomer()).orElse(null);
        if (user == null) {
            log.warn("invoice.paid for unknown customer {}", invoice.getCustomer());
            return;
        }

        upsertSubscription(user, stripeSubscription);
    }

    private void handleSubscriptionUpdated(com.stripe.model.Subscription stripeSubscription) {
        Subscription subscription = subscriptionRepository.findByStripeSubscriptionId(stripeSubscription.getId())
                .orElse(null);

        if (subscription == null) {
            String customerId = stripeSubscription.getCustomer();
            User user = userRepository.findByStripeCustomerId(customerId).orElse(null);
            if (user == null) {
                log.warn("subscription.updated for unknown customer {}", customerId);
                return;
            }
            upsertSubscription(user, stripeSubscription);
            return;
        }

        applyStripeSubscription(subscription, stripeSubscription);
        subscriptionRepository.save(subscription);
    }

    private void handleSubscriptionDeleted(com.stripe.model.Subscription stripeSubscription) {
        subscriptionRepository.findByStripeSubscriptionId(stripeSubscription.getId()).ifPresent(subscription -> {
            subscription.setStatus(SubscriptionStatus.CANCELLED);
            subscription.setCancelledAt(LocalDateTime.now());
            subscriptionRepository.save(subscription);
        });
    }

    private User resolveUser(Session session) {
        Map<String, String> metadata = session.getMetadata();
        if (metadata != null && metadata.get("user_id") != null) {
            Long userId = Long.parseLong(metadata.get("user_id"));
            return userRepository.findById(userId).orElse(null);
        }

        if (session.getClientReferenceId() != null && !session.getClientReferenceId().isBlank()) {
            Long userId = Long.parseLong(session.getClientReferenceId());
            return userRepository.findById(userId).orElse(null);
        }

        if (session.getCustomer() != null) {
            return userRepository.findByStripeCustomerId(session.getCustomer()).orElse(null);
        }

        return null;
    }

    private void upsertSubscription(User user, com.stripe.model.Subscription stripeSubscription) {
        Subscription subscription = subscriptionRepository.findByUserId(user.getId())
                .orElseGet(Subscription::new);

        subscription.setUser(user);
        applyStripeSubscription(subscription, stripeSubscription);
        subscriptionRepository.save(subscription);
        log.info("Subscription saved for user {} status {}", user.getEmail(), subscription.getStatus());
    }

    private void applyStripeSubscription(Subscription subscription, com.stripe.model.Subscription stripeSubscription) {
        subscription.setStripeSubscriptionId(stripeSubscription.getId());
        subscription.setPlanId(extractPlanId(stripeSubscription));
        subscription.setStatus(mapStripeStatus(stripeSubscription.getStatus()));

        if (stripeSubscription.getCurrentPeriodStart() != null) {
            subscription.setCurrentPeriodStart(toLocalDateTime(stripeSubscription.getCurrentPeriodStart()));
        }
        if (stripeSubscription.getCurrentPeriodEnd() != null) {
            subscription.setCurrentPeriodEnd(toLocalDateTime(stripeSubscription.getCurrentPeriodEnd()));
        }
    }

    private String extractPlanId(com.stripe.model.Subscription stripeSubscription) {
        if (stripeSubscription.getItems() == null
                || stripeSubscription.getItems().getData() == null
                || stripeSubscription.getItems().getData().isEmpty()) {
            return null;
        }
        return stripeSubscription.getItems().getData().get(0).getPrice().getId();
    }

    private SubscriptionStatus mapStripeStatus(String status) {
        return switch (status) {
            case "active", "trialing" -> SubscriptionStatus.ACTIVE;
            case "past_due" -> SubscriptionStatus.PAST_DUE;
            case "canceled" -> SubscriptionStatus.CANCELLED;
            default -> SubscriptionStatus.EXPIRED;
        };
    }

    private LocalDateTime toLocalDateTime(Long epochSeconds) {
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }
}
