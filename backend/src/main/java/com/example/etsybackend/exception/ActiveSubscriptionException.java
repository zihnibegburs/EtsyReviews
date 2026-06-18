package com.example.etsybackend.exception;

public class ActiveSubscriptionException extends RuntimeException {
    public ActiveSubscriptionException(String message) {
        super(message);
    }
}
