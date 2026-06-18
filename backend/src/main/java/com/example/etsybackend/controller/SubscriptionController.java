package com.example.etsybackend.controller;

import com.example.etsybackend.dto.SubscriptionDTO;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.repository.SubscriptionRepository;
import com.example.etsybackend.repository.UserRepository;
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

    public SubscriptionController(SubscriptionRepository subscriptionRepository, UserRepository userRepository) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
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

        SubscriptionDTO dto = new SubscriptionDTO();
        dto.setPlanId(subscription.getPlanId());
        dto.setStatus(subscription.getStatus());
        dto.setCurrentPeriodEnd(subscription.getCurrentPeriodEnd());

        return ResponseEntity.ok(dto);
    }

    @GetMapping("/status")
    @Operation(summary = "Check subscription status", description = "Check if the user has an active subscription")
    public ResponseEntity<Map<String, Object>> checkSubscriptionStatus(Authentication authentication) {
        String email = authentication.getName();
        Long userId = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"))
                .getId();

        Subscription subscription = subscriptionRepository.findByUserId(userId).orElse(null);

        boolean hasActiveSubscription = subscription != null &&
                subscription.getStatus().toString().equals("ACTIVE");

        return ResponseEntity.ok(Map.of(
            "hasActiveSubscription", hasActiveSubscription,
            "status", subscription != null ? subscription.getStatus() : "NONE"
        ));
    }
}

