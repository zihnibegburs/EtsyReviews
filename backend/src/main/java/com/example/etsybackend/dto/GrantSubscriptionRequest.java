package com.example.etsybackend.dto;

import lombok.Data;

@Data
public class GrantSubscriptionRequest {
    private Long userId;
    private String email;
}
