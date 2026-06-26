package com.example.etsybackend.repository;

import com.example.etsybackend.model.PaddleEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PaddleEventRepository extends JpaRepository<PaddleEvent, Long> {
    Optional<PaddleEvent> findByEventId(String eventId);
}
