"use client";

import { useEffect } from "react";
import { initializePaddle } from "@paddle/paddle-js";

export default function CheckoutPage() {
  useEffect(() => {
    async function init() {
      try {
        const token = 'test_5819be4e87ffbdab24876840c4d';

        if (!token) {
          console.error("❌ Missing Paddle client token");
          return;
        }

        // Initialize Paddle
        const paddle = await initializePaddle({
          environment: "sandbox", // switch to "production" when you go live
          token,
        });

        // Attach click handler safely
        const btn = document.getElementById("checkout-btn");
        if (btn) {
          btn.addEventListener("click", () => {
            paddle.Checkout.open({
              items: [
                { priceId: "pri_01k4d6txnqjgvvg4f0fhv5a409", quantity: 1 },
              ],
              settings: {
                displayMode: "overlay", // stays on your page
              },
            });
          });
        }
      } catch (error) {
        console.error("Failed to initialize Paddle:", error);
      }
    }

    init();
  }, []);

  return (
    <main style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>Checkout (On-Page)</h1>
      <button
        id="checkout-btn"
        style={{
          padding: "12px 20px",
          fontSize: "18px",
          backgroundColor: "#000",
          color: "#fff",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Buy Now
      </button>
    </main>
  );
}
