package com.example.etsybackend.repository;

import com.example.etsybackend.model.StripeEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StripeEventRepository extends JpaRepository<StripeEvent, Long> {
    Optional<StripeEvent> findByStripeEventId(String stripeEventId);
}
