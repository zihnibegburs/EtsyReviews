package com.example.etsybackend.controller;

import com.example.etsybackend.dto.AuthResponse;
import com.example.etsybackend.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Authentication endpoints")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/google")
    @Operation(summary = "Authenticate with Google", description = "Authenticate user with Google OAuth credentials and return JWT token")
    public ResponseEntity<AuthResponse> googleAuth(@RequestBody Map<String, String> request) {
        String googleId = request.get("googleId");
        String email = request.get("email");
        String name = request.get("name");
        String pictureUrl = request.get("pictureUrl");

        AuthResponse response = authService.authenticateGoogleUser(googleId, email, name, pictureUrl);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/google/code")
    @Operation(summary = "Authenticate with Google authorization code", description = "Exchange Google OAuth code from Chrome extension and return JWT token")
    public ResponseEntity<AuthResponse> googleAuthCode(@RequestBody Map<String, String> request) {
        String code = request.get("code");
        String redirectUri = request.get("redirectUri");

        if (code == null || code.isBlank() || redirectUri == null || redirectUri.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        AuthResponse response = authService.authenticateGoogleCode(code, redirectUri);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/validate")
    @Operation(summary = "Validate JWT token", description = "Check if the provided JWT token is valid")
    public ResponseEntity<Map<String, Boolean>> validateToken(@RequestHeader("Authorization") String authHeader) {
        // If the request reaches here, the token is valid (filtered by JwtAuthenticationFilter)
        return ResponseEntity.ok(Map.of("valid", true));
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user", description = "Get currently authenticated user information")
    public ResponseEntity<?> getCurrentUser(@RequestHeader("Authorization") String authHeader) {
        try {
            String token = authHeader.substring(7); // Remove "Bearer " prefix
            String email = authService.getEmailFromToken(token);
            var user = authService.getUserByEmail(email);
            return ResponseEntity.ok(user);
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token"));
        }
    }
}

