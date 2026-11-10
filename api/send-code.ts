import { sendEmail, buildPasswordResetHtml } from "./email";

export default async function handler(req: any, res: any) {
  // Support standard CORS headers to allow Vercel and local requests with no issues
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  const { email, code, type } = req.body || {};

  if (!email || !code) {
    return res.status(400).json({ success: false, error: "Email and code are required" });
  }

  const isReset = type === "reset";
  const subject = isReset 
    ? "Reset Your Journaly Password" 
    : "Your Journaly Verification Code";

  const textContent = isReset
    ? `Hello Trader,\n\nWe received a request to reset your password on your Journaly account (${email}).\n\nYour verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can safely ignore this email.\n\nBest regards,\nJournaly Security Team`
    : `Hello Trader,\n\nYour Journaly access code is: ${code}\n\nBest regards,\nJournaly Security Team`;

  const htmlContent = buildPasswordResetHtml(code, email);

  try {
    const result = await sendEmail({
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        provider: result.provider,
        messageId: result.messageId,
        previewUrl: result.previewUrl
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to dispatch email."
      });
    }
  } catch (err: any) {
    console.error("[SEND CODE API ERROR]", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Email dispatch failed."
    });
  }
}
