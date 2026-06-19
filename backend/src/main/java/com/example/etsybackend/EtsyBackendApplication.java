package com.example.etsybackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class EtsyBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(EtsyBackendApplication.class, args);
    }

}
