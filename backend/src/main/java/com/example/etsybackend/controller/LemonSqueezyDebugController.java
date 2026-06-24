package com.example.etsybackend.controller;

import com.example.etsybackend.model.LemonSqueezyEvent;
import com.example.etsybackend.model.LemonSqueezyPayment;
import com.example.etsybackend.repository.LemonSqueezyEventRepository;
import com.example.etsybackend.repository.LemonSqueezyPaymentRepository;
import com.example.etsybackend.service.LemonSqueezyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/lemonsqueezy")
@Tag(name = "Lemon Squeezy Debug", description = "Inspect stored Lemon Squeezy events and payments")
@SecurityRequirement(name = "bearerAuth")
public class LemonSqueezyDebugController {
    private final LemonSqueezyEventRepository eventRepository;
    private final LemonSqueezyPaymentRepository paymentRepository;
    private final LemonSqueezyService lemonSqueezyService;

    public LemonSqueezyDebugController(
            LemonSqueezyEventRepository eventRepository,
            LemonSqueezyPaymentRepository paymentRepository,
            LemonSqueezyService lemonSqueezyService
    ) {
        this.eventRepository = eventRepository;
        this.paymentRepository = paymentRepository;
        this.lemonSqueezyService = lemonSqueezyService;
    }

    @GetMapping("/events")
    @Operation(summary = "List recent Lemon Squeezy webhook events")
    public ResponseEntity<List<LemonSqueezyEvent>> listEvents() {
        List<LemonSqueezyEvent> events = eventRepository.findAll().stream()
                .sorted(Comparator.comparing(LemonSqueezyEvent::getCreatedAt).reversed())
                .limit(50)
                .toList();
        return ResponseEntity.ok(events);
    }

    @GetMapping("/payments")
    @Operation(summary = "List recorded Lemon Squeezy payments")
    public ResponseEntity<List<LemonSqueezyPayment>> listPayments() {
        List<LemonSqueezyPayment> payments = paymentRepository.findAll().stream()
                .sorted(Comparator.comparing(LemonSqueezyPayment::getCreatedAt).reversed())
                .limit(50)
                .toList();
        return ResponseEntity.ok(payments);
    }

    @PostMapping("/backfill-payments")
    @Operation(summary = "Create payment records from stored webhook payloads")
    public ResponseEntity<Map<String, Long>> backfillPayments() {
        long created = lemonSqueezyService.backfillPaymentsFromStoredEvents();
        return ResponseEntity.ok(Map.of("paymentsCreated", created));
    }
}
