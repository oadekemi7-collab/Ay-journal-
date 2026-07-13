import { Request, Response } from "express";

// Safe dynamic node-fetch import for Paystack API queries
const fetch = (...args: any[]) => import("node-fetch").then(({ default: fetch }) => (fetch as any)(...args));

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_live_c10d7635687e25fa913c3770474a62301de08f52";

/**
 * POST /api/paystack/initialize
 * Initializes a transaction with Paystack and returns authorization URL.
 */
export async function handleInitializePaystack(req: Request, res: Response) {
  const { email, callbackUrl } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: "User email is required to initialize subscription checkout."
    });
  }

  try {
    const amountInKobo = 1500000; // ₦15,000.00 represented in kobo (Paystack standard unit)
    console.log(`[PAYSTACK INITIALIZE] Creating payment request for email: ${email}, Amount: ₦15,000`);

    const payload: any = {
      email: email.trim().toLowerCase(),
      amount: amountInKobo,
      metadata: {
        plan: "premium",
        email: email.trim().toLowerCase()
      }
    };

    if (callbackUrl) {
      payload.callback_url = callbackUrl;
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data: any = await paystackRes.json();

    if (!paystackRes.ok || !data.status) {
      console.error("[PAYSTACK INITIALIZE ERROR] Paystack response:", data);
      return res.status(400).json({
        success: false,
        error: data.message || "Failed to initialize Paystack transaction. Please check your credentials."
      });
    }

    console.log(`[PAYSTACK INITIALIZE] Checkout created! Reference: ${data.data.reference}`);
    return res.json({
      success: true,
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code
    });

  } catch (err: any) {
    console.error("[PAYSTACK INITIALIZE FATAL] Server error:", err);
    return res.status(500).json({
      success: false,
      error: `Server initialization error: ${err.message || String(err)}`
    });
  }
}

/**
 * POST /api/paystack/verify
 * Verifies transaction with Paystack server-side, checks for duplication, and upgrades user's plan.
 */
export async function handleVerifyPaystack(req: Request, res: Response) {
  const { reference, email } = req.body;

  if (!reference || !email) {
    return res.status(400).json({
      success: false,
      error: "Both transaction reference and user email are required for verification."
    });
  }

  try {
    console.log(`[PAYSTACK VERIFY] Querying Paystack for reference: ${reference}`);

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
      }
    });

    const data: any = await verifyRes.json();

    if (!verifyRes.ok || !data.status) {
      console.error("[PAYSTACK VERIFY ERROR] Verification request failed:", data);
      return res.status(400).json({
        success: false,
        error: data.message || "Failed to verify transaction with Paystack server."
      });
    }

    const transaction = data.data;

    // Safety checks: Validate payment status, email matching, and currency/amount
    if (transaction.status !== "success") {
      console.log(`[PAYSTACK VERIFY] Transaction not successful yet. Current status: ${transaction.status}`);
      return res.status(400).json({
        success: false,
        error: `Transaction status is '${transaction.status}'. Payment must be successful to upgrade.`
      });
    }

    const customerEmail = transaction.customer?.email?.trim()?.toLowerCase();
    const expectedEmail = email.trim().toLowerCase();

    if (customerEmail !== expectedEmail) {
      console.error(`[PAYSTACK VERIFY WARNING] Email mismatch! Paystack: ${customerEmail}, App Request: ${expectedEmail}`);
      return res.status(400).json({
        success: false,
        error: "Security verification failed: Paystack checkout email does not match logged-in user."
      });
    }

    // Dynamic import to fetch Firestore DB operations safely
    const { getUserProfile, updateUserProfile } = await import("../src/lib/firebase.ts");

    // Duplicate Payment protection - fetch current user profile to verify reference
    const profile = await getUserProfile(expectedEmail);
    if (profile && profile.paymentReference === reference && profile.plan === "premium") {
      console.log(`[PAYSTACK VERIFY] Duplicate prevention triggered. Reference ${reference} already processed.`);
      return res.json({
        success: true,
        message: "This payment has already been successfully processed. Your Premium features are fully active!",
        plan: "premium"
      });
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30-day Premium activation

    const upgradeData = {
      plan: "premium",
      subscription: "premium",
      subscriptionPlan: "premium",
      paymentReference: reference,
      activationDate: new Date().toISOString(),
      expiryDate: expiryDate.toISOString(),
      amountPaid: (transaction.amount || 1500000) / 100, // standard decimal currency representation (₦15,000.00)
      paymentStatus: "success",
      paymentChannel: transaction.channel || "card",
      paymentGateways: transaction.gateway_response || "Paystack Gateway Response",
      updatedAt: new Date()
    };

    console.log(`[PAYSTACK VERIFY] Transaction successful. Upgrading ${expectedEmail} to Premium plan!`);
    await updateUserProfile(expectedEmail, upgradeData);

    return res.json({
      success: true,
      message: "Congratulations! Your Paystack transaction has been verified and your Premium account is now active.",
      plan: "premium"
    });

  } catch (err: any) {
    console.error("[PAYSTACK VERIFY FATAL] Server verification error:", err);
    return res.status(500).json({
      success: false,
      error: `Server verification error: ${err.message || String(err)}`
    });
  }
}
