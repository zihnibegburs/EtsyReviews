package com.example.etsybackend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@ConditionalOnProperty(name = "swagger.password")
public class SwaggerSecurityConfig {

    @Bean
    @Order(1)
    public SecurityFilterChain swaggerSecurityFilterChain(
            HttpSecurity http,
            @Value("${swagger.username}") String username,
            @Value("${swagger.password}") String password,
            PasswordEncoder passwordEncoder) throws Exception {
        UserDetails user = User.builder()
                .username(username)
                .password(passwordEncoder.encode(password))
                .roles("SWAGGER")
                .build();

        http
                .securityMatcher(
                        "/swagger-ui/**",
                        "/swagger-ui.html",
                        "/api-docs",
                        "/api-docs/**",
                        "/v3/api-docs/**",
                        "/webjars/**"
                )
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(Customizer.withDefaults())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .userDetailsService(new InMemoryUserDetailsManager(user))
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated());

        return http.build();
    }
}
