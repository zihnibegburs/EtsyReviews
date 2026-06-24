package com.example.etsybackend.controller;

import com.example.etsybackend.service.LemonSqueezyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/lemonsqueezy")
@Tag(name = "Lemon Squeezy Webhooks", description = "Lemon Squeezy webhook endpoints")
public class LemonSqueezyWebhookController {
    private static final Logger log = LoggerFactory.getLogger(LemonSqueezyWebhookController.class);

    private final LemonSqueezyService lemonSqueezyService;

    public LemonSqueezyWebhookController(LemonSqueezyService lemonSqueezyService) {
        this.lemonSqueezyService = lemonSqueezyService;
    }

    @PostMapping("/webhook")
    @Operation(summary = "Lemon Squeezy webhook handler", description = "Handle subscription events from Lemon Squeezy")
    public ResponseEntity<String> handleWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "X-Signature", required = false) String signature
    ) {
        if (signature == null || signature.isBlank()) {
            log.warn("Lemon Squeezy webhook missing X-Signature header");
            return ResponseEntity.badRequest().body("Missing X-Signature");
        }

        try {
            lemonSqueezyService.handleWebhook(payload, signature);
            return ResponseEntity.ok("ok");
        } catch (SecurityException e) {
            log.error("Invalid Lemon Squeezy webhook signature: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Invalid signature");
        } catch (Exception e) {
            log.error("Lemon Squeezy webhook processing error: {}", e.getMessage(), e);
            return ResponseEntity.ok("received with processing error");
        }
    }
}
