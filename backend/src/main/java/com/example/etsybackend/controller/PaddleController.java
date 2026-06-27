package com.example.etsybackend.controller;

import com.example.etsybackend.exception.ActiveSubscriptionException;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.UserRepository;
import com.example.etsybackend.service.PaddleService;
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
@RequestMapping("/api/paddle")
@Tag(name = "Paddle", description = "Paddle subscription endpoints")
public class PaddleController {
    private final PaddleService paddleService;
    private final UserRepository userRepository;

    @Value("${paddle.price-id-monthly}")
    private String priceIdMonthly;

    @Value("${paddle.price-id-yearly}")
    private String priceIdYearly;

    public PaddleController(PaddleService paddleService, UserRepository userRepository) {
        this.paddleService = paddleService;
        this.userRepository = userRepository;
    }

    @GetMapping("/config")
    @Operation(summary = "Get Paddle public config for extension checkout")
    public ResponseEntity<Map<String, String>> getConfig() {
        Map<String, String> config = new HashMap<>();
        config.put("priceIdMonthly", priceIdMonthly);
        config.put("priceIdYearly", priceIdYearly);
        return ResponseEntity.ok(config);
    }

    @PostMapping("/checkout")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Create Paddle checkout", description = "Returns hosted checkout URL for subscription")
    public ResponseEntity<Map<String, String>> createCheckout(
            Authentication authentication,
            @RequestBody Map<String, Object> request
    ) {
        String email = authentication.getName();
        Object priceIdValue = request.get("priceId");
        String priceId = priceIdValue == null ? null : String.valueOf(priceIdValue);

        if (priceId == null || priceId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "priceId is required"));
        }

        if (!isTermsAccepted(request)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "You must accept the Terms of Service before subscribing."
            ));
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        try {
            String checkoutUrl = paddleService.createCheckoutUrl(
                    user.getId(),
                    user.getEmail(),
                    user.getName(),
                    priceId
            );

            Map<String, String> response = new HashMap<>();
            response.put("checkoutUrl", checkoutUrl);
            response.put("priceId", priceId);
            return ResponseEntity.ok(response);
        } catch (ActiveSubscriptionException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to create checkout: " + e.getMessage()));
        }
    }

    private boolean isTermsAccepted(Map<String, Object> request) {
        Object value = request.get("acceptedTerms");
        if (value instanceof Boolean accepted) {
            return accepted;
        }
        if (value instanceof String accepted) {
            return "true".equalsIgnoreCase(accepted);
        }
        return false;
    }
}
