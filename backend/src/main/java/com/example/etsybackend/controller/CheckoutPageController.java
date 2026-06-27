package com.example.etsybackend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

@RestController
public class CheckoutPageController {
    @Value("${paddle.client-token:}")
    private String paddleClientToken;

    @Value("${paddle.environment:sandbox}")
    private String paddleEnvironment;

    @GetMapping(value = "/checkout/pay", produces = MediaType.TEXT_HTML_VALUE)
    public String checkoutPay() {
        if (paddleClientToken == null || paddleClientToken.isBlank()) {
            return """
                    <!DOCTYPE html>
                    <html lang="en">
                    <head><meta charset="utf-8"><title>Checkout unavailable</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding: 48px;">
                      <h1>Checkout unavailable</h1>
                      <p>Paddle client token is not configured on the server.</p>
                    </body>
                    </html>
                    """;
        }

        String token = HtmlUtils.htmlEscape(paddleClientToken.trim());
        boolean sandbox = !"production".equalsIgnoreCase(paddleEnvironment);
        String envScript = sandbox
                ? "Paddle.Environment.set('sandbox');\n"
                : "";

        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Checkout — EtsyFetcher PRO</title>
                  <style>
                    body {
                      font-family: system-ui, sans-serif;
                      margin: 0;
                      min-height: 100vh;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: #f6f7f9;
                      color: #1a1a1a;
                    }
                    .card {
                      text-align: center;
                      padding: 32px;
                      max-width: 420px;
                    }
                    .spinner {
                      width: 36px;
                      height: 36px;
                      border: 3px solid #ddd;
                      border-top-color: #f1641e;
                      border-radius: 50%%;
                      animation: spin 0.8s linear infinite;
                      margin: 0 auto 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                  </style>
                  <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
                </head>
                <body>
                  <div class="card">
                    <div class="spinner" id="spinner"></div>
                    <h1>Opening checkout…</h1>
                    <p id="status">Please wait while we load secure payment.</p>
                  </div>
                  <script>
                    (function () {
                      const status = document.getElementById('status');
                      const spinner = document.getElementById('spinner');

                      function showError(message) {
                        if (spinner) spinner.style.display = 'none';
                        if (status) status.textContent = message;
                      }

                      try {
                        %s
                        Paddle.Initialize({
                          token: '%s',
                          checkout: {
                            settings: {
                              displayMode: 'overlay',
                              theme: 'light',
                              locale: 'en'
                            }
                          },
                          eventCallback: function (event) {
                            if (event.name === 'checkout.error') {
                              showError('Checkout could not be opened. Please try again from the extension.');
                            }
                          }
                        });
                      } catch (error) {
                        showError('Failed to initialize checkout. Please try again.');
                        console.error(error);
                      }
                    })();
                  </script>
                </body>
                </html>
                """.formatted(envScript, token);
    }

    @GetMapping(value = "/checkout/success", produces = MediaType.TEXT_HTML_VALUE)
    public String checkoutSuccess() {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="utf-8"><title>Payment successful</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 48px;">
                  <h1>Payment successful</h1>
                  <p>Your PRO subscription is being activated.</p>
                  <p>You can close this tab and return to the Chrome extension.</p>
                </body>
                </html>
                """;
    }

    @GetMapping(value = "/checkout/cancel", produces = MediaType.TEXT_HTML_VALUE)
    public String checkoutCancel() {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="utf-8"><title>Payment cancelled</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 48px;">
                  <h1>Payment cancelled</h1>
                  <p>No charge was made. You can close this tab.</p>
                </body>
                </html>
                """;
    }
}
