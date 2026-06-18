package com.example.etsybackend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "stripe_payments")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class StripePayment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;

    @Column(unique = true)
    private String stripeSessionId;

    private String stripePaymentIntentId;
    private String stripeSubscriptionId;
    private String stripeCustomerId;
    private String priceId;
    private Long amountTotal;
    private String currency;
    private String status;
    private String customerEmail;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
