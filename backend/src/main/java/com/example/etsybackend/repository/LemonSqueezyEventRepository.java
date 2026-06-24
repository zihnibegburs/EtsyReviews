package com.example.etsybackend.repository;

import com.example.etsybackend.model.LemonSqueezyEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LemonSqueezyEventRepository extends JpaRepository<LemonSqueezyEvent, Long> {
    Optional<LemonSqueezyEvent> findByEventId(String eventId);
}
