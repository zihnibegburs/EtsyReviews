package com.example.etsybackend.controller;

import com.example.etsybackend.dto.GrantSubscriptionRequest;
import com.example.etsybackend.dto.GrantSubscriptionResponse;
import com.example.etsybackend.service.SubscriptionGrantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/subscription")
@Tag(name = "Admin Subscription", description = "Manual subscription grants (admin API key required)")
public class AdminSubscriptionController {
    private final SubscriptionGrantService subscriptionGrantService;

    public AdminSubscriptionController(SubscriptionGrantService subscriptionGrantService) {
        this.subscriptionGrantService = subscriptionGrantService;
    }

    @PostMapping("/grant")
    @Operation(
            summary = "Grant or extend subscription",
            description = "Creates a 1-month subscription for a user, or extends an existing one by 1 month. "
                    + "Requires X-Admin-Key header."
    )
    public ResponseEntity<?> grantSubscription(
            @RequestHeader("X-Admin-Key") String adminKey,
            @RequestBody GrantSubscriptionRequest request
    ) {
        try {
            GrantSubscriptionResponse response = subscriptionGrantService.grantOrExtend(adminKey, request);
            return ResponseEntity.ok(response);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
