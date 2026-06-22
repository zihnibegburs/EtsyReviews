package com.example.etsybackend.scheduler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@ConditionalOnProperty(name = "app.health-check.enabled", havingValue = "true", matchIfMissing = false)
public class HealthKeepAliveScheduler {

    private static final Logger log = LoggerFactory.getLogger(HealthKeepAliveScheduler.class);

    private final RestClient restClient;
    private final String healthUrl;

    public HealthKeepAliveScheduler(
            @Value("${server.port}") int port,
            @Value("${app.health-check.url:}") String configuredHealthUrl) {
        this.restClient = RestClient.create();
        this.healthUrl = configuredHealthUrl.isBlank()
                ? "http://127.0.0.1:" + port + "/health"
                : configuredHealthUrl;
    }

    @Scheduled(cron = "${app.health-check.cron:0 */5 * * * *}")
    public void pingHealthEndpoint() {
        try {
            var response = restClient.get()
                    .uri(healthUrl)
                    .retrieve()
                    .toEntity(String.class);

            log.info("Self health check OK ({}): {}", response.getStatusCode().value(), healthUrl);
        } catch (Exception exception) {
            log.warn("Self health check failed ({}): {}", healthUrl, exception.getMessage());
        }
    }
}
