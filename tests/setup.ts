import "dotenv/config";

const url = new URL(process.env.DATABASE_URL!);
url.pathname = `${url.pathname.replace(/_test$/, "")}_test`;
process.env.DATABASE_URL = url.toString();
process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";
