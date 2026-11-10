import nodemailer from "nodemailer";

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: string;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

/**
 * Dispatches an email using the best available configured provider:
 * 1. Resend REST API (if RESEND_API_KEY is set)
 * 2. Brevo REST API (if BREVO_API_KEY is set)
 * 3. SendGrid REST API (if SENDGRID_API_KEY is set)
 * 4. Custom SMTP via Nodemailer (if SMTP_HOST and SMTP_PASS are set)
 * 5. Ethereal Email (Auto-generated test sandbox when no live keys are configured)
 */
export async function sendEmail({ to, subject, text, html }: EmailPayload): Promise<EmailSendResult> {
  const cleanTo = to.trim().toLowerCase();
  const fromName = process.env.SMTP_FROM_NAME || "Journaly Security";
  const defaultFrom = process.env.SMTP_FROM_EMAIL || "security@journaly.com";

  // Provider 1: Resend REST API
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[EMAIL DISPATCHER] Sending email to ${cleanTo} via Resend REST API...`);
      const fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM_EMAIL || `Journaly <onboarding@resend.dev>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [cleanTo],
          subject,
          text,
          html
        })
      });

      const resData: any = await res.json();
      if (res.ok && resData && resData.id) {
        console.log(`[EMAIL DISPATCHER] Successfully dispatched email via Resend (ID: ${resData.id})`);
        return {
          success: true,
          provider: "resend",
          messageId: resData.id
        };
      } else {
        console.warn(`[EMAIL DISPATCHER] Resend API rejected message:`, resData);
      }
    } catch (resendErr: any) {
      console.error("[EMAIL DISPATCHER] Error dispatching via Resend:", resendErr?.message || resendErr);
    }
  }

  // Provider 2: Brevo (Sendinblue) REST API
  if (process.env.BREVO_API_KEY) {
    try {
      console.log(`[EMAIL DISPATCHER] Sending email to ${cleanTo} via Brevo REST API...`);
      const fromEmail = process.env.BREVO_FROM || process.env.SMTP_FROM_EMAIL || "security@journaly.com";
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY.trim(),
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: cleanTo }],
          subject,
          htmlContent: html,
          textContent: text
        })
      });

      const resData: any = await res.json();
      if (res.ok && resData && resData.messageId) {
        console.log(`[EMAIL DISPATCHER] Successfully dispatched email via Brevo (ID: ${resData.messageId})`);
        return {
          success: true,
          provider: "brevo",
          messageId: resData.messageId
        };
      } else {
        console.warn(`[EMAIL DISPATCHER] Brevo API rejected message:`, resData);
      }
    } catch (brevoErr: any) {
      console.error("[EMAIL DISPATCHER] Error dispatching via Brevo:", brevoErr?.message || brevoErr);
    }
  }

  // Provider 3: SendGrid REST API
  if (process.env.SENDGRID_API_KEY) {
    try {
      console.log(`[EMAIL DISPATCHER] Sending email to ${cleanTo} via SendGrid REST API...`);
      const fromEmail = process.env.SENDGRID_FROM || process.env.SMTP_FROM_EMAIL || "security@journaly.com";
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.SENDGRID_API_KEY.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: cleanTo }] }],
          from: { email: fromEmail, name: fromName },
          subject,
          content: [
            { type: "text/plain", value: text },
            { type: "text/html", value: html }
          ]
        })
      });

      if (res.status >= 200 && res.status < 300) {
        console.log(`[EMAIL DISPATCHER] Successfully dispatched email via SendGrid`);
        return {
          success: true,
          provider: "sendgrid"
        };
      } else {
        const errText = await res.text();
        console.warn(`[EMAIL DISPATCHER] SendGrid API rejected message (HTTP ${res.status}):`, errText);
      }
    } catch (sgErr: any) {
      console.error("[EMAIL DISPATCHER] Error dispatching via SendGrid:", sgErr?.message || sgErr);
    }
  }

  // Provider 4: Custom SMTP (Nodemailer)
  if (process.env.SMTP_HOST && process.env.SMTP_PASS) {
    try {
      const host = process.env.SMTP_HOST.trim();
      const port = parseInt(process.env.SMTP_PORT || "587", 10);
      const user = (process.env.SMTP_USER || "").trim();
      // Clean password of any accidental whitespace (e.g. from Google app password groups)
      const pass = process.env.SMTP_PASS.replace(/\s+/g, "");
      const fromEmail = process.env.SMTP_FROM_EMAIL || user || defaultFrom;
      const isSecure = port === 465 || process.env.SMTP_SECURE === "true";

      console.log(`[EMAIL DISPATCHER] Attempting SMTP dispatch to ${cleanTo} via ${host}:${port}...`);
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: isSecure,
        auth: user ? { user, pass } : undefined,
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: cleanTo,
        subject,
        text,
        html,
        headers: {
          "X-Entity-Ref-ID": `${Date.now()}_ref`,
          "Importance": "high",
          "Priority": "Urgent"
        }
      });

      console.log(`[EMAIL DISPATCHER] Successfully dispatched email via Custom SMTP: ${info.messageId}`);
      return {
        success: true,
        provider: "smtp",
        messageId: info.messageId
      };
    } catch (smtpErr: any) {
      console.error("[EMAIL DISPATCHER] Custom SMTP dispatch failed:", smtpErr?.message || smtpErr);
    }
  }

  // Provider 5: Automated Ethereal Sandbox (Guarantees zero-hang delivery testing and live preview)
  try {
    console.log(`[EMAIL DISPATCHER] No external provider configured or previous providers failed. Utilizing Ethereal live sandbox...`);
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    const info = await transporter.sendMail({
      from: `"${fromName}" <no-reply@journaly.com>`,
      to: cleanTo,
      subject,
      text,
      html
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    console.log(`[EMAIL DISPATCHER] Live email verification generated successfully!`);
    console.log(`[EMAIL DISPATCHER] Message ID: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[EMAIL DISPATCHER] Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      provider: "ethereal_sandbox",
      messageId: info.messageId,
      previewUrl
    };
  } catch (etherealErr: any) {
    console.error("[EMAIL DISPATCHER] Ethereal delivery error:", etherealErr);
    return {
      success: false,
      provider: "none",
      error: etherealErr?.message || "All email delivery channels failed."
    };
  }
}

/**
 * Builds the responsive HTML template for password reset emails
 */
export function buildPasswordResetHtml(code: string, recipientEmail: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Journaly Password</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #09090b; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px 28px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
            <!-- Header with Journaly Logo -->
            <tr>
              <td align="center" style="padding-bottom: 24px;">
                <table border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: middle;">
                      <div style="width: 44px; height: 44px; line-height: 44px; border-radius: 12px; background: linear-gradient(135deg, #10b981 0%, #0d9488 100%); text-align: center; color: #09090b; font-weight: 900; font-size: 24px;">J</div>
                    </td>
                    <td style="vertical-align: middle;">
                      <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em; line-height: 1.1; text-transform: uppercase;">JOURNALY</div>
                      <div style="font-size: 11px; color: #10b981; font-weight: 700; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase;">Security Verification</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            
            <!-- Message Body -->
            <tr>
              <td style="font-size: 14px; line-height: 1.6; color: #a1a1aa; padding-bottom: 20px;">
                <p style="margin-top: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Hello Trader,</p>
                <p style="margin-bottom: 0;">
                  We received a request to reset your password on your Journaly account (<strong style="color: #ffffff;">${recipientEmail}</strong>). Enter the verification PIN below to authorize your new password:
                </p>
              </td>
            </tr>
            
            <!-- Code Block -->
            <tr>
              <td align="center" style="padding: 16px 0 24px 0;">
                <div style="background-color: #09090b; border-radius: 12px; padding: 20px 16px; text-align: center; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #10b981; border: 1px solid #10b981/40; font-family: 'Courier New', Courier, monospace; max-width: 300px; margin: 0 auto; box-shadow: 0 0 25px rgba(16, 185, 129, 0.15);">
                  ${code}
                </div>
                <div style="font-size: 11px; color: #71717a; margin-top: 10px; font-weight: 500;">
                  This code expires in 15 minutes.
                </div>
              </td>
            </tr>
            
            <!-- Context Security Note -->
            <tr>
              <td style="font-size: 12px; line-height: 1.6; color: #71717a; border-top: 1px solid #27272a; padding-top: 20px;">
                <p style="margin: 0;">
                  <strong style="color: #e4e4e7;">Security Tip:</strong> Never share this code with anyone. Journaly staff will never ask you for your verification code or login password. If you didn't request a password reset, you can safely disregard this email.
                </p>
                <p style="margin: 20px 0 0 0; font-size: 11px; color: #52525b; text-align: center;">
                  &copy; 2026 Journaly. Institutional-Grade Trade Analytics.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
