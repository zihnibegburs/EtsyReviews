package com.example.etsybackend.controller;

import com.example.etsybackend.model.StripeEvent;
import com.example.etsybackend.model.StripePayment;
import com.example.etsybackend.repository.StripeEventRepository;
import com.example.etsybackend.repository.StripePaymentRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;

@RestController
@RequestMapping("/api/stripe")
@Tag(name = "Stripe Debug", description = "Inspect stored Stripe events and payments")
@SecurityRequirement(name = "bearerAuth")
public class StripeDebugController {
    private final StripeEventRepository stripeEventRepository;
    private final StripePaymentRepository stripePaymentRepository;

    public StripeDebugController(
            StripeEventRepository stripeEventRepository,
            StripePaymentRepository stripePaymentRepository
    ) {
        this.stripeEventRepository = stripeEventRepository;
        this.stripePaymentRepository = stripePaymentRepository;
    }

    @GetMapping("/events")
    @Operation(summary = "List recent Stripe webhook events")
    public ResponseEntity<List<StripeEvent>> listEvents() {
        List<StripeEvent> events = stripeEventRepository.findAll().stream()
                .sorted(Comparator.comparing(StripeEvent::getCreatedAt).reversed())
                .limit(50)
                .toList();
        return ResponseEntity.ok(events);
    }

    @GetMapping("/payments")
    @Operation(summary = "List recorded Stripe payments")
    public ResponseEntity<List<StripePayment>> listPayments() {
        List<StripePayment> payments = stripePaymentRepository.findAll().stream()
                .sorted(Comparator.comparing(StripePayment::getCreatedAt).reversed())
                .limit(50)
                .toList();
        return ResponseEntity.ok(payments);
    }
}
