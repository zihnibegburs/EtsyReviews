package com.example.etsybackend.controller;

import com.example.etsybackend.dto.SubscriptionDTO;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
import com.example.etsybackend.service.StripeService;
import com.stripe.exception.StripeException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/subscription")
@Tag(name = "Subscription", description = "Subscription management endpoints")
@SecurityRequirement(name = "bearerAuth")
public class SubscriptionController {
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final StripeService stripeService;

    public SubscriptionController(
            SubscriptionRepository subscriptionRepository,
            UserRepository userRepository,
            StripeService stripeService
    ) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.stripeService = stripeService;
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user's subscription", description = "Retrieve subscription details for the authenticated user")
    public ResponseEntity<SubscriptionDTO> getMySubscription(Authentication authentication) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        Subscription subscription = subscriptionRepository.findByUserId(userId).orElse(null);

        if (subscription == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(toDto(subscription));
    }

    @PostMapping("/cancel")
    @Operation(summary = "Cancel Stripe subscription", description = "Cancels at end of current billing period")
    public ResponseEntity<?> cancelSubscription(Authentication authentication) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        try {
            Subscription subscription = stripeService.cancelSubscription(userId);
            return ResponseEntity.ok(toDto(subscription));
        } catch (StripeException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to cancel subscription: " + e.getMessage()));
        }
    }

    @PostMapping("/reactivate")
    @Operation(summary = "Reactivate Stripe subscription", description = "Removes scheduled cancellation before period end")
    public ResponseEntity<?> reactivateSubscription(Authentication authentication) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        try {
            Subscription subscription = stripeService.reactivateSubscription(userId);
            return ResponseEntity.ok(toDto(subscription));
        } catch (StripeException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to reactivate subscription: " + e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/upgrade")
    @Operation(summary = "Upgrade subscription plan", description = "Upgrades existing subscription with proration")
    public ResponseEntity<?> upgradeSubscription(
            Authentication authentication,
            @RequestBody Map<String, String> request
    ) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        String priceId = request.get("priceId");
        if (priceId == null || priceId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "priceId is required"));
        }

        try {
            Subscription subscription = stripeService.upgradeSubscription(userId, priceId);
            return ResponseEntity.ok(toDto(subscription));
        } catch (StripeException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to upgrade subscription: " + e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/status")
    @Operation(summary = "Check subscription status", description = "Check if the user has an active subscription")
    public ResponseEntity<Map<String, Object>> checkSubscriptionStatus(Authentication authentication) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        Subscription subscription = subscriptionRepository.findByUserId(userId).orElse(null);

        boolean hasActiveSubscription = subscription != null && hasProAccess(subscription);

        return ResponseEntity.ok(Map.of(
            "hasActiveSubscription", hasActiveSubscription,
            "status", subscription != null ? subscription.getStatus() : "NONE"
        ));
    }

    private boolean hasProAccess(Subscription subscription) {
        return subscription.getStatus() == com.example.etsybackend.model.SubscriptionStatus.ACTIVE
                || subscription.getStatus() == com.example.etsybackend.model.SubscriptionStatus.TRIAL
                || subscription.getStatus() == com.example.etsybackend.model.SubscriptionStatus.PAST_DUE;
    }

    private SubscriptionDTO toDto(Subscription subscription) {
        SubscriptionDTO dto = new SubscriptionDTO();
        dto.setPlanId(subscription.getPlanId());
        dto.setStatus(subscription.getStatus());
        dto.setCurrentPeriodEnd(subscription.getCurrentPeriodEnd());
        dto.setCancelledAt(subscription.getCancelledAt());
        dto.setCancelAtPeriodEnd(subscription.getCancelAtPeriodEnd());
        return dto;
    }
}

