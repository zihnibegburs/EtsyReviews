package com.example.etsybackend.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class PaddleApiClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public PaddleApiClient(
            @Value("${paddle.api-key}") String apiKey,
            @Value("${paddle.environment:sandbox}") String environment,
            ObjectMapper objectMapper
    ) {
        this.objectMapper = objectMapper;
        String baseUrl = "production".equalsIgnoreCase(environment)
                ? "https://api.paddle.com"
                : "https://sandbox-api.paddle.com";

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Accept", "application/json")
                .defaultHeader("Content-Type", "application/json")
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
    }

    public JsonNode createCustomer(String email, String name) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("email", email);
        if (name != null && !name.isBlank()) {
            body.put("name", name);
        }
        return post("/customers", body).path("data");
    }

    public JsonNode createTransaction(
            String customerId,
            String priceId,
            Long userId,
            String successUrl,
            String cancelUrl
    ) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("customer_id", customerId);

        ObjectNode item = body.putArray("items").addObject();
        item.put("price_id", priceId);
        item.put("quantity", 1);

        ObjectNode customData = body.putObject("custom_data");
        customData.put("user_id", userId.toString());

        ObjectNode checkout = body.putObject("checkout");
        checkout.put("success_url", successUrl);
        checkout.put("cancel_url", cancelUrl);

        return post("/transactions", body).path("data");
    }

    public JsonNode getSubscription(String subscriptionId) {
        return get("/subscriptions/" + subscriptionId).path("data");
    }

    public JsonNode cancelSubscription(String subscriptionId) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("effective_from", "next_billing_period");
        return post("/subscriptions/" + subscriptionId + "/cancel", body).path("data");
    }

    public JsonNode resumeSubscription(String subscriptionId) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("effective_from", "immediately");
        return post("/subscriptions/" + subscriptionId + "/resume", body).path("data");
    }

    public JsonNode updateSubscriptionItems(String subscriptionId, String priceId) {
        ObjectNode body = objectMapper.createObjectNode();
        ObjectNode item = body.putArray("items").addObject();
        item.put("price_id", priceId);
        item.put("quantity", 1);
        body.put("proration_billing_mode", "prorated_immediately");
        return patch("/subscriptions/" + subscriptionId, body).path("data");
    }

    private JsonNode post(String path, ObjectNode body) {
        return restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                    throw new RuntimeException(mapClientError(response.getStatusCode().value(), response));
                })
                .body(JsonNode.class);
    }

    private JsonNode patch(String path, ObjectNode body) {
        return restClient.patch()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                    throw new RuntimeException(mapClientError(response.getStatusCode().value(), response));
                })
                .body(JsonNode.class);
    }

    private JsonNode get(String path) {
        return restClient.get()
                .uri(path)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                    throw new RuntimeException(mapClientError(response.getStatusCode().value(), response));
                })
                .body(JsonNode.class);
    }

    private String mapClientError(int status, org.springframework.http.client.ClientHttpResponse response) {
        if (status == 401) {
            return "Invalid Paddle API key. Set PADDLE_API_KEY in your environment.";
        }
        try {
            String body = new String(response.getBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            return "Paddle API error (" + status + "): " + body;
        } catch (Exception e) {
            return "Paddle API error (" + status + ")";
        }
    }
}
