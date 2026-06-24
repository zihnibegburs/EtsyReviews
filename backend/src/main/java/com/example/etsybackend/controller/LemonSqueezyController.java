package com.example.etsybackend.controller;

import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.UserRepository;
import com.example.etsybackend.service.LemonSqueezyService;
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
@RequestMapping("/api/lemonsqueezy")
@Tag(name = "Lemon Squeezy", description = "Lemon Squeezy subscription endpoints")
public class LemonSqueezyController {
    private final LemonSqueezyService lemonSqueezyService;
    private final UserRepository userRepository;

    @Value("${lemonsqueezy.variant-id-monthly}")
    private String variantIdMonthly;

    @Value("${lemonsqueezy.variant-id-yearly}")
    private String variantIdYearly;

    public LemonSqueezyController(LemonSqueezyService lemonSqueezyService, UserRepository userRepository) {
        this.lemonSqueezyService = lemonSqueezyService;
        this.userRepository = userRepository;
    }

    @GetMapping("/config")
    @Operation(summary = "Get Lemon Squeezy public config for extension checkout")
    public ResponseEntity<Map<String, String>> getConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("variantIdMonthly", variantIdMonthly);
        config.put("variantIdYearly", variantIdYearly);
        return ResponseEntity.ok(config);
    }

    @PostMapping("/checkout")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Create Lemon Squeezy checkout", description = "Returns hosted checkout URL for subscription")
    public ResponseEntity<Map<String, String>> createCheckout(
            Authentication authentication,
            @RequestBody Map<String, String> request
    ) {
        String email = authentication.getName();
        String variantId = request.get("variantId");

        if (variantId == null || variantId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "variantId is required"));
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        try {
            String checkoutUrl = lemonSqueezyService.createCheckoutUrl(
                    user.getId(),
                    user.getEmail(),
                    variantId
            );

            Map<String, String> response = new HashMap<>();
            response.put("checkoutUrl", checkoutUrl);
            response.put("variantId", variantId);
            return ResponseEntity.ok(response);
        } catch (ActiveSubscriptionException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create checkout: " + e.getMessage()));
        }
    }
}
