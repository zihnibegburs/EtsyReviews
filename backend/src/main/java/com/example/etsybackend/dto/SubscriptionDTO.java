package com.example.etsybackend.dto;

import com.example.etsybackend.model.SubscriptionStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SubscriptionDTO {
    private String planId;
    private SubscriptionStatus status;
    private LocalDateTime currentPeriodEnd;
    private LocalDateTime cancelledAt;
}

