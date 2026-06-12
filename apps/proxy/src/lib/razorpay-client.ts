import Razorpay from "razorpay";
import { config } from "../config.js";

/**
 * Returns true when real Razorpay credentials have been configured.
 * Falls back to dev-mode stubs when the placeholder values are still in place.
 */
export function hasRealCredentials(): boolean {
  return (
    config.RAZORPAY_KEY_ID !== "rzp_test_placeholder" &&
    config.RAZORPAY_KEY_SECRET !== "placeholder_secret" &&
    config.RAZORPAY_KEY_ID.startsWith("rzp_")
  );
}

let _client: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!_client) {
    _client = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return _client;
}

export const PLAN_AMOUNTS_WEEKLY: Record<string, number> = {
  starter: 5000,  // ₹50 in paise
  pro: 7500,      // ₹75 in paise
  max: 10000,     // ₹100 in paise
};

export const PLAN_NAMES: Record<string, string> = {
  starter: "WatsonLB Starter",
  pro: "WatsonLB Pro",
  max: "WatsonLB Max",
};
