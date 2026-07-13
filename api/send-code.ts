import nodemailer from "nodemailer";

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

  try {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "toolaoilqbi@gmail.com";
    const pass = process.env.SMTP_PASS || "zjzh milx advx ymom";
    
    // Crucial: to prevent SPF, DKIM, and spoofing flags, fromEmail MUST match the authenticated SMTP user!
    const fromEmail = user;
    const fromName = process.env.SMTP_FROM_NAME || "Journaly";

    console.log(`[SMTP Service Vercel] Attempting SMTP dispatch to ${email} (Type: ${type || 'auth'}) via ${user} on ${host}:${port}...`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const subject = isReset 
      ? `Reset Your Journaly Password` 
      : `Your Journaly Verification Code`;

    const textContent = isReset
      ? `Hello,

We received a request to reset your password on your Journaly account. 

Your verification code is: ${code}

Please enter this verification code back on the password reset screen to select a new secure passcode.

If you didn't request this reset, you can safely ignore this email.

Best regards,
Journaly Team`
      : `Hello,

You requested a secure login verification code to sign in or register with your Journaly account.

Your verification code is: ${code}

Please enter this verification code on the authentication screen to complete your sign-in.

If you didn't request this code, you can safely ignore this email.

Best regards,
Journaly Team`;

    const htmlContent = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 450px; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <!-- Header with J Logo -->
            <tr>
              <td>
                <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: middle;">
                      <div style="width: 42px; height: 42px; line-height: 42px; border-radius: 10px; background-color: #10b981; text-align: center; color: #ffffff; font-weight: 800; font-size: 22px;">J</div>
                    </td>
                    <td style="vertical-align: middle;">
                      <div style="font-size: 18px; font-weight: 800; color: #18181b; letter-spacing: -0.02em; line-height: 1.2;">Journaly</div>
                      <div style="font-size: 11px; color: #71717a; font-weight: 500; margin-top: 2px;">Security Team</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Message Body -->
            <tr>
              <td style="font-size: 14px; line-height: 1.6; color: #27272a;">
                <p style="margin-top: 0; font-size: 15px; font-weight: 600; color: #18181b;">Hello,</p>
                <p style="margin-bottom: 24px;">
                  ${isReset 
                    ? "We received a request to reset your password. Use the following code to authorize this action:" 
                    : "We received a request to access your account. Please use the following code to log in safely:"
                  }
                </p>
              </td>
            </tr>
            
            <!-- Code Block -->
            <tr>
              <td align="center" style="padding-bottom: 8px;">
                <div style="background-color: #f4f4f5; border-radius: 8px; padding: 18px 10px; text-align: center; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #10b981; border: 1px solid #e4e4e7; font-family: 'Courier New', Courier, monospace; max-width: 280px; margin: 0 auto;">
                  ${code}
                </div>
              </td>
            </tr>
            
            <!-- Context Security Note -->
            <tr>
              <td style="font-size: 12px; line-height: 1.6; color: #71717a; padding-top: 24px;">
                <p style="margin: 0; border-top: 1px solid #e4e4e7; padding-top: 20px;">
                  This verification code is temporary and valid for a single session. 
                  If you did not make this request or sign in, you can safely ignore this email. 
                  Do not share this code with anyone.
                </p>
                <p style="margin: 16px 0 0 0; font-size: 11px; color: #a1a1aa; line-height: 1.4; text-align: center;">
                  Journaly Inc. &bull; 100 Pine Street, San Francisco, CA 94111<br />
                  &copy; 2026 Journaly. This security notification is automated.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent,
      headers: {
        "X-Entity-Ref-ID": `${Date.now()}_ref`,
        "Importance": "high",
        "Priority": "Urgent",
        "X-Priority": "1",
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All"
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SMTP Service Vercel] Email dispatched successfully to ${email}`);
    return res.status(200).json({ success: true, isCustomSmtp: true });
  } catch (error: any) {
    console.error("[SMTP Service Vercel] Error sending email via primary SMTP, trying fallback:", error);
    
    // secondary backup route via FormSubmit to guarantee delivery if 587 port of some hosting providers is blocked
    try {
      console.log(`[SMTP Service Vercel] Routing fallback email to ${email} via FormSubmit...`);
      const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email.toLowerCase().trim())}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          _subject: isReset ? `Journaly Password Reset Code` : `Journaly Verification Code`,
          "Code": code,
          "Type": type || "auth",
          "Message": isReset
            ? `We received a request to reset your password on Journaly. Your password reset verification code is: ${code}. Enter this code on the password reset screen to select a new secure login passcode.`
            : `We received a request to sign in or register on Journaly. Your verification code is: ${code}. Enter it on the authentication page to authorize access.`,
          _captcha: "false"
        })
      });

      if (response.ok) {
        const resJson = await response.json();
        console.log(`[SMTP Service Vercel] Fallback email routed successfully. FormSubmit Response:`, resJson);
        return res.status(200).json({ success: true, isFormSubmit: true });
      } else {
        const errText = await response.text();
        console.error(`[SMTP Service Vercel] Fallback delivery failed:`, errText);
        throw new Error(errText);
      }
    } catch (err: any) {
      console.error("FormSubmit integration error:", err);
      return res.status(500).json({ success: false, error: `Connection failed: ${error.message}` });
    }
  }
}
