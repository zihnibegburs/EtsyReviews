package com.example.etsybackend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "lemonsqueezy_payments")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LemonSqueezyPayment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    @Column(unique = true)
    private String orderId;

    @Column(unique = true)
    private String invoiceId;

    private String subscriptionId;
    private String customerId;
    private String variantId;
    private Long total;
    private String currency;
    private String status;
    private String customerEmail;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
