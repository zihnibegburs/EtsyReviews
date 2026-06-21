package com.example.etsybackend.service;

import com.example.etsybackend.dto.AuthResponse;
import com.example.etsybackend.dto.SubscriptionDTO;
import com.example.etsybackend.dto.UserDTO;
import com.example.etsybackend.model.AuthProvider;
import com.example.etsybackend.model.Subscription;
import com.example.etsybackend.model.User;
import com.example.etsybackend.repository.UserRepository;
import com.example.etsybackend.security.JwtUtil;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final GoogleOAuthService googleOAuthService;

    public AuthService(UserRepository userRepository, JwtUtil jwtUtil, GoogleOAuthService googleOAuthService) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
        this.googleOAuthService = googleOAuthService;
    }

    public AuthResponse authenticateGoogleUser(String googleId, String email, String name, String pictureUrl) {
        User user = userRepository.findByGoogleId(googleId)
                .orElseGet(() -> {
                    User newUser = new User();
                    newUser.setGoogleId(googleId);
                    newUser.setEmail(email);
                    newUser.setName(name);
                    newUser.setPictureUrl(pictureUrl);
                    newUser.setProvider(AuthProvider.GOOGLE);
                    return userRepository.save(newUser);
                });

        boolean nameChanged = name != null && !name.equals(user.getName());
        boolean pictureChanged = pictureUrl != null && !pictureUrl.equals(user.getPictureUrl());
        if (nameChanged || pictureChanged) {
            if (name != null) {
                user.setName(name);
            }
            if (pictureUrl != null) {
                user.setPictureUrl(pictureUrl);
            }
            user = userRepository.save(user);
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId());
        UserDTO userDTO = convertToDTO(user);

        return new AuthResponse(token, userDTO);
    }

    public AuthResponse authenticateGoogleAccessToken(String accessToken) {
        Map<String, Object> userInfo = googleOAuthService.fetchUserInfo(accessToken);
        return authenticateGoogleUser(
                (String) userInfo.get("id"),
                (String) userInfo.get("email"),
                (String) userInfo.get("name"),
                (String) userInfo.get("picture")
        );
    }

    private UserDTO convertToDTO(User user) {
        UserDTO dto = new UserDTO();
        dto.setId(user.getId());
        dto.setEmail(user.getEmail());
        dto.setName(user.getName());
        dto.setPictureUrl(user.getPictureUrl());

        if (user.getSubscription() != null) {
            Subscription sub = user.getSubscription();
            SubscriptionDTO subDTO = new SubscriptionDTO();
            subDTO.setPlanId(sub.getPlanId());
            subDTO.setStatus(sub.getStatus());
            subDTO.setCurrentPeriodEnd(sub.getCurrentPeriodEnd());
            subDTO.setCancelledAt(sub.getCancelledAt());
            subDTO.setCancelAtPeriodEnd(sub.getCancelAtPeriodEnd());
            dto.setSubscription(subDTO);
        }

        return dto;
    }

    public String getEmailFromToken(String token) {
        return jwtUtil.extractEmail(token);
    }

    public UserDTO getUserByEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return convertToDTO(user);
    }
}

