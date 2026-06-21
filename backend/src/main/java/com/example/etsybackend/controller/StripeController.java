package com.example.etsybackend.controller;

import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.UserRepository;
import com.example.etsybackend.service.StripeService;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/stripe")
@Tag(name = "Stripe", description = "Stripe subscription endpoints")
public class StripeController {
    private final StripeService stripeService;
    private final UserRepository userRepository;

    @Value("${stripe.publishable-key}")
    private String publishableKey;

    @Value("${stripe.price-id-monthly}")
    private String priceIdMonthly;

    @Value("${stripe.price-id-yearly}")
    private String priceIdYearly;

    public StripeController(StripeService stripeService, UserRepository userRepository) {
        this.stripeService = stripeService;
        this.userRepository = userRepository;
    }

    @GetMapping("/config")
    @Operation(summary = "Get Stripe public config for extension checkout")
    public ResponseEntity<Map<String, String>> getConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("publishableKey", publishableKey);
        config.put("priceIdMonthly", priceIdMonthly);
        config.put("priceIdYearly", priceIdYearly);
        return ResponseEntity.ok(config);
    }

    @PostMapping("/checkout")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Create Stripe Checkout session", description = "Returns hosted checkout URL for subscription")
    public ResponseEntity<Map<String, String>> createCheckout(
            Authentication authentication,
            @RequestBody Map<String, String> request
    ) {
        String email = authentication.getName();
        String priceId = request.get("priceId");

        if (priceId == null || priceId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "priceId is required"));
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        try {
            Session session = stripeService.createCheckoutSession(user.getId(), user.getEmail(), priceId);

            Map<String, String> response = new HashMap<>();
            response.put("checkoutUrl", session.getUrl());
            response.put("sessionId", session.getId());
            response.put("priceId", priceId);
            return ResponseEntity.ok(response);
        } catch (ActiveSubscriptionException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (StripeException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create checkout: " + e.getMessage()));
        }
    }
}
