package com.example.etsybackend.controller;

import com.example.etsybackend.service.PaddleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/paddle")
@Tag(name = "Paddle Webhooks", description = "Paddle webhook endpoints")
public class PaddleWebhookController {
    private static final Logger log = LoggerFactory.getLogger(PaddleWebhookController.class);

    private final PaddleService paddleService;

    public PaddleWebhookController(PaddleService paddleService) {
        this.paddleService = paddleService;
    }

    @PostMapping("/webhook")
    @Operation(summary = "Paddle webhook handler", description = "Handle subscription events from Paddle")
    public ResponseEntity<String> handleWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "Paddle-Signature", required = false) String signature
    ) {
        if (signature == null || signature.isBlank()) {
            log.warn("Paddle webhook missing Paddle-Signature header");
            return ResponseEntity.badRequest().body("Missing Paddle-Signature");
        }

        try {
            paddleService.handleWebhook(payload, signature);
            return ResponseEntity.ok("ok");
        } catch (SecurityException e) {
            log.error("Invalid Paddle webhook signature: {}", e.getMessage());
            return ResponseEntity.status(401).body("Invalid signature");
        } catch (Exception e) {
            log.error("Paddle webhook processing error: {}", e.getMessage(), e);
            return ResponseEntity.ok("received with processing error");
        }
    }
}
