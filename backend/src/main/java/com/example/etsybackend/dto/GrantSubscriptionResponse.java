package com.example.etsybackend.dto;

import com.example.etsybackend.model.SubscriptionStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class GrantSubscriptionResponse {
    private String action;
    private Long userId;
    private String email;
    private SubscriptionStatus status;
    private LocalDateTime currentPeriodEnd;
}
