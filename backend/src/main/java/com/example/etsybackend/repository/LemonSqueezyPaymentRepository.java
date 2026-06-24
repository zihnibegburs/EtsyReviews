package com.example.etsybackend.repository;

import com.example.etsybackend.model.LemonSqueezyPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LemonSqueezyPaymentRepository extends JpaRepository<LemonSqueezyPayment, Long> {
    Optional<LemonSqueezyPayment> findByOrderId(String orderId);

    Optional<LemonSqueezyPayment> findByInvoiceId(String invoiceId);
}
