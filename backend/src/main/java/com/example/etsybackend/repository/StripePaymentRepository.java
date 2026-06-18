package com.example.etsybackend.repository;

import com.example.etsybackend.model.StripePayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StripePaymentRepository extends JpaRepository<StripePayment, Long> {
    Optional<StripePayment> findByStripeSessionId(String stripeSessionId);
}
