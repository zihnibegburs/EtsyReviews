package com.example.etsybackend.service;

import com.example.etsybackend.dto.GrantSubscriptionRequest;
import com.example.etsybackend.dto.GrantSubscriptionResponse;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.model.SubscriptionStatus;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;

@Service
public class SubscriptionGrantService {
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;

    @Value("${app.admin-api-key:}")
    private String adminApiKey;

    @Value("${paddle.price-id-monthly}")
    private String monthlyPriceId;

    public SubscriptionGrantService(
            UserRepository userRepository,
            SubscriptionRepository subscriptionRepository
    ) {
        this.userRepository = userRepository;
        this.subscriptionRepository = subscriptionRepository;
    }

    public void validateAdminKey(String providedKey) {
        if (adminApiKey == null || adminApiKey.isBlank()) {
            throw new SecurityException("Admin API is not configured");
        }
        if (providedKey == null || providedKey.isBlank()) {
            throw new SecurityException("Missing admin API key");
        }
        boolean matches = MessageDigest.isEqual(
                adminApiKey.getBytes(StandardCharsets.UTF_8),
                providedKey.getBytes(StandardCharsets.UTF_8)
        );
        if (!matches) {
            throw new SecurityException("Invalid admin API key");
        }
    }

    @Transactional
    public GrantSubscriptionResponse grantOrExtend(String adminKey, GrantSubscriptionRequest request) {
        validateAdminKey(adminKey);

        User user = resolveUser(request);
        LocalDateTime now = LocalDateTime.now();

        Subscription subscription = subscriptionRepository.findByUserId(user.getId()).orElse(null);
        String action;

        if (subscription == null) {
            subscription = new Subscription();
            subscription.setUser(user);
            subscription.setStatus(SubscriptionStatus.ACTIVE);
            subscription.setPlanId(monthlyPriceId);
            subscription.setCurrentPeriodStart(now);
            subscription.setCurrentPeriodEnd(now.plusMonths(1));
            subscription.setCancelAtPeriodEnd(false);
            subscription.setCancelledAt(null);
            action = "created";
        } else {
            LocalDateTime base = subscription.getCurrentPeriodEnd();
            if (base == null || base.isBefore(now) || !hasProAccess(subscription)) {
                base = now;
                subscription.setCurrentPeriodStart(now);
            }
            subscription.setStatus(SubscriptionStatus.ACTIVE);
            subscription.setCurrentPeriodEnd(base.plusMonths(1));
            subscription.setCancelAtPeriodEnd(false);
            subscription.setCancelledAt(null);
            action = "extended";
        }

        subscriptionRepository.save(subscription);

        GrantSubscriptionResponse response = new GrantSubscriptionResponse();
        response.setAction(action);
        response.setUserId(user.getId());
        response.setEmail(user.getEmail());
        response.setStatus(subscription.getStatus());
        response.setCurrentPeriodEnd(subscription.getCurrentPeriodEnd());
        return response;
    }

    private User resolveUser(GrantSubscriptionRequest request) {
        if (request.getUserId() != null) {
            return userRepository.findById(request.getUserId())
                    .orElseThrow(() -> new IllegalArgumentException("User not found: id=" + request.getUserId()));
        }

        String email = request.getEmail();
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("email or userId is required");
        }

        return userRepository.findByEmail(email.trim())
                .orElseThrow(() -> new IllegalArgumentException("User not found: email=" + email.trim()));
    }

    private boolean hasProAccess(Subscription subscription) {
        SubscriptionStatus status = subscription.getStatus();
        if (status == SubscriptionStatus.ACTIVE
                || status == SubscriptionStatus.TRIAL
                || status == SubscriptionStatus.PAST_DUE) {
            return true;
        }
        if (!Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd())
                && subscription.getCancelledAt() == null) {
            return false;
        }
        return subscription.getCurrentPeriodEnd() != null
                && subscription.getCurrentPeriodEnd().isAfter(LocalDateTime.now());
    }
}
