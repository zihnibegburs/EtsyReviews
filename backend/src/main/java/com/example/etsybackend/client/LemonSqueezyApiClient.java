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
public class LemonSqueezyApiClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public LemonSqueezyApiClient(
            @Value("${lemonsqueezy.api-key}") String apiKey,
            ObjectMapper objectMapper
    ) {
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl("https://api.lemonsqueezy.com/v1")
                .defaultHeader("Accept", "application/vnd.api+json")
                .defaultHeader("Content-Type", "application/vnd.api+json")
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .build();
    }

    public JsonNode createCheckout(
            String storeId,
            String variantId,
            String email,
            Long userId,
            String successUrl
    ) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode data = root.putObject("data");
        data.put("type", "checkouts");

        ObjectNode attributes = data.putObject("attributes");
        ObjectNode productOptions = attributes.putObject("product_options");
        productOptions.put("redirect_url", successUrl);

        ObjectNode checkoutData = attributes.putObject("checkout_data");
        checkoutData.put("email", email);
        ObjectNode custom = checkoutData.putObject("custom");
        custom.put("user_id", userId.toString());

        ObjectNode relationships = data.putObject("relationships");
        relationships.putObject("store")
                .putObject("data")
                .put("type", "stores")
                .put("id", storeId);
        relationships.putObject("variant")
                .putObject("data")
                .put("type", "variants")
                .put("id", variantId);

        return post("/checkouts", root);
    }

    public JsonNode getOrder(String orderId) {
        return get("/orders/" + orderId);
    }

    public JsonNode getSubscription(String subscriptionId) {
        return get("/subscriptions/" + subscriptionId);
    }

    public JsonNode updateSubscription(String subscriptionId, ObjectNode attributes) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode data = root.putObject("data");
        data.put("type", "subscriptions");
        data.put("id", subscriptionId);
        data.set("attributes", attributes);
        return patch("/subscriptions/" + subscriptionId, root);
    }

    private JsonNode post(String path, ObjectNode body) {
        return restClient.post()
                .uri(path)
                .contentType(MediaType.parseMediaType("application/vnd.api+json"))
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
                .contentType(MediaType.parseMediaType("application/vnd.api+json"))
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
            return "Invalid Lemon Squeezy API key. Create one in Lemon Squeezy → Settings → API "
                    + "and set lemonsqueezy.api-key in application-local.properties.";
        }
        try {
            String body = new String(response.getBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            return "Lemon Squeezy API error (" + status + "): " + body;
        } catch (Exception e) {
            return "Lemon Squeezy API error (" + status + ")";
        }
    }
}
