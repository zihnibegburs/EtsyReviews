package com.example.etsybackend.controller;

import com.example.etsybackend.service.StripeService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.net.Webhook;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stripe")
@Tag(name = "Stripe Webhooks", description = "Stripe webhook endpoints")
public class StripeWebhookController {
    private static final Logger log = LoggerFactory.getLogger(StripeWebhookController.class);

    private final StripeService stripeService;

    @Value("${stripe.webhook-secret}")
    private String webhookSecret;

    public StripeWebhookController(StripeService stripeService) {
        this.stripeService = stripeService;
    }

    @PostMapping("/webhook")
    @Operation(summary = "Stripe webhook handler", description = "Handle subscription events from Stripe")
    public ResponseEntity<String> handleWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature
    ) {
        if (signature == null || signature.isBlank()) {
            log.warn("Stripe webhook missing signature header");
            return ResponseEntity.badRequest().body("Missing Stripe-Signature");
        }

        try {
            Event event = Webhook.constructEvent(payload, signature, webhookSecret);
            stripeService.handleWebhook(event, payload);
            return ResponseEntity.ok("ok");
        } catch (SignatureVerificationException e) {
            log.error("Invalid Stripe webhook signature: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Invalid signature");
        } catch (Exception e) {
            log.error("Stripe webhook processing error: {}", e.getMessage(), e);
            // Return 200 so Stripe does not endlessly retry while we debug via stripe_events table
            return ResponseEntity.ok("received with processing error");
        }
    }
}
