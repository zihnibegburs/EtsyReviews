package com.example.etsybackend.dto;

import lombok.Data;

@Data
public class UserDTO {
    private Long id;
    private String email;
    private String name;
    private String pictureUrl;
    private SubscriptionDTO subscription;
}

