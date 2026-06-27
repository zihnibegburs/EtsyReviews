package com.example.etsybackend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

import java.util.List;

public final class PublicPaths {
    private static final List<String> PATTERNS = List.of(
            "/",
            "/index.html",
            "/health",
            "/pricing",
            "/pricing/**",
            "/terms",
            "/terms/**",
            "/privacy",
            "/privacy/**",
            "/refund",
            "/refund/**",
            "/css/**",
            "/checkout/success",
            "/checkout/cancel",
            "/checkout/pay",
            "/api/auth/**",
            "/api/admin/**",
            "/api/paddle/config",
            "/api/paddle/webhook"
    );

    private static final RequestMatcher MATCHER = new OrRequestMatcher(
            PATTERNS.stream().map(AntPathRequestMatcher::new).toArray(RequestMatcher[]::new)
    );

    private PublicPaths() {
    }

    public static String[] patterns() {
        return PATTERNS.toArray(String[]::new);
    }

    public static boolean matches(HttpServletRequest request) {
        return MATCHER.matches(request);
    }
}
