package com.example.etsybackend.controller;

import com.example.etsybackend.model.PaddleEvent;
import com.example.etsybackend.repository.PaddleEventRepository;
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
@RequestMapping("/api/paddle")
@Tag(name = "Paddle Debug", description = "Inspect stored Paddle webhook events")
@SecurityRequirement(name = "bearerAuth")
public class PaddleDebugController {
    private final PaddleEventRepository eventRepository;

    public PaddleDebugController(PaddleEventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    @GetMapping("/events")
    @Operation(summary = "List recent Paddle webhook events")
    public ResponseEntity<List<PaddleEvent>> listEvents() {
        List<PaddleEvent> events = eventRepository.findAll().stream()
                .sorted(Comparator.comparing(PaddleEvent::getCreatedAt).reversed())
                .limit(50)
                .toList();
        return ResponseEntity.ok(events);
    }
}
