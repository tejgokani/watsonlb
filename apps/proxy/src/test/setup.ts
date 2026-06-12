// Provide test env vars before any module loads config
process.env["DATABASE_URL"] = "postgresql://test:test@localhost/test";
process.env["JWT_SECRET"] = "test-secret-that-is-at-least-32-chars-long!!";
process.env["RESEND_API_KEY"] = "re_test_key";
process.env["RAZORPAY_KEY_ID"] = "rzp_test_placeholder";
process.env["RAZORPAY_KEY_SECRET"] = "placeholder_secret";
process.env["RAZORPAY_WEBHOOK_SECRET"] = "placeholder_webhook";
process.env["NODE_ENV"] = "test";
process.env["PROXY_BASE_URL"] = "http://localhost:3001";
