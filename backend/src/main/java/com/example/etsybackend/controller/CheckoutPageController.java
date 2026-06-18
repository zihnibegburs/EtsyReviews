package com.example.etsybackend.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CheckoutPageController {
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
