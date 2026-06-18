package com.example.etsybackend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
public class GoogleOAuthService {
    private final RestClient restClient = RestClient.create();

    @Value("${google.oauth2.client-id}")
    private String clientId;

    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchUserInfo(String accessToken) {
        Map<String, Object> tokenInfo = restClient.get()
                .uri("https://oauth2.googleapis.com/tokeninfo?access_token={token}", accessToken)
                .retrieve()
                .body(Map.class);

        if (tokenInfo == null || tokenInfo.containsKey("error")) {
            throw new RuntimeException("Invalid Google access token");
        }

        String issuedTo = (String) tokenInfo.get("issued_to");
        if (issuedTo == null) {
            issuedTo = (String) tokenInfo.get("aud");
        }
        if (issuedTo == null) {
            issuedTo = (String) tokenInfo.get("azp");
        }
        if (clientId != null && issuedTo != null && !clientId.equals(issuedTo)) {
            throw new RuntimeException(
                    "Google token was not issued for this application. Expected client "
                            + clientId + " but got " + issuedTo
            );
        }

        Map<String, Object> userInfo = restClient.get()
                .uri("https://www.googleapis.com/oauth2/v2/userinfo")
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .body(Map.class);

        if (userInfo == null || userInfo.get("id") == null || userInfo.get("email") == null) {
            throw new RuntimeException("Failed to fetch Google user info");
        }

        return userInfo;
    }
}
