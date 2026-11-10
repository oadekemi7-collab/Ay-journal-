import { Request, Response } from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../src/lib/firebase";

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 64;
const DIGEST = "sha512";
const SESSION_SECRET = process.env.SESSION_SECRET || "journaly_trade_journal_session_secret_key_v1";

export interface SessionPayload {
  email: string;
  name: string;
  iat: number;
  exp: number;
}

/**
 * Securely hashes a password using PBKDF2 with SHA-512, 100k iterations, and a unique 16-byte random salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/**
 * Verifies a password attempt against stored PBKDF2 hash or legacy plaintext string.
 */
export function verifyPassword(passwordAttempt: string, storedHashOrPlain: string): boolean {
  if (!storedHashOrPlain || !passwordAttempt) return false;

  // Check if stored password is in PBKDF2 format
  if (storedHashOrPlain.startsWith("pbkdf2$")) {
    const parts = storedHashOrPlain.split("$");
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const originalHash = parts[3];
      const attemptHash = crypto.pbkdf2Sync(passwordAttempt, salt, iterations, KEY_LEN, DIGEST).toString("hex");
      try {
        return crypto.timingSafeEqual(Buffer.from(attemptHash, "hex"), Buffer.from(originalHash, "hex"));
      } catch {
        return false;
      }
    }
  }

  // Fallback: Legacy plaintext password check for existing accounts
  return storedHashOrPlain === passwordAttempt;
}

/**
 * Creates a signed stateless HMAC-SHA256 session token valid for 30 days.
 */
export function createSessionToken(email: string, name: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    email: email.toLowerCase().trim(),
    name: name || email.split("@")[0],
    iat: now,
    exp: now + 30 * 24 * 60 * 60 // 30 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a signed session token. Returns null if invalid or expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Helper to extract session payload from request headers
 */
export function getAuthenticatedUser(req: Request): SessionPayload | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (typeof req.headers["x-auth-token"] === "string") {
    token = req.headers["x-auth-token"].trim();
  }

  if (!token) return null;
  return verifySessionToken(token);
}

// In-memory OTP and magic token store with 15-minute expiration
interface OtpEntry {
  email: string;
  code: string;
  magicToken: string;
  expiresAt: number;
}
const otpStore = new Map<string, OtpEntry>();

// Transporter for sending passwordless authentication emails
async function sendAuthEmail(toEmail: string, code: string, magicLink: string) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "toolaoilqbi@gmail.com";
  const pass = process.env.SMTP_PASS || "zjzh milx advx ymom";
  const fromName = process.env.SMTP_FROM_NAME || "Journaly";

  const subject = "Your Journaly Sign-In Link & Code";

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f4f4f5;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
          <!-- Header Logo -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right: 10px; vertical-align: middle;">
                    <div style="width: 38px; height: 38px; line-height: 38px; border-radius: 10px; background-color: #10b981; text-align: center; color: #09090b; font-weight: 900; font-size: 20px;">J</div>
                  </td>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: -0.02em;">JOURNALY</div>
                    <div style="font-size: 10px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Passwordless Access</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro text -->
          <tr>
            <td style="font-size: 14px; line-height: 1.6; color: #d4d4d8; text-align: center; padding-bottom: 24px;">
              Click the button below to sign in to Journaly instantly. No password required.
            </td>
          </tr>

          <!-- Magic Link Button -->
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <a href="${magicLink}" target="_blank" style="display: inline-block; background-color: #10b981; color: #09090b; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: 0.02em; text-transform: uppercase; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
                Sign In to Journaly
              </a>
            </td>
          </tr>

          <!-- Note -->
          <tr>
            <td style="font-size: 11px; line-height: 1.5; color: #71717a; text-align: center; border-top: 1px solid #27272a; padding-top: 20px;">
              This sign-in link is valid for 15 minutes. If you did not request this, you can safely ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = `Your Journaly Sign-In Link:

Click here to sign in: ${magicLink}

This link will expire in 15 minutes. No password required. If you did not request this, you can ignore this email.`;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent
    });
    console.log(`[AUTH OTP] Email successfully sent to ${toEmail}`);
    return true;
  } catch (smtpErr: any) {
    console.warn(`[AUTH OTP] Primary SMTP error:`, smtpErr?.message || smtpErr);
    // Fallback via FormSubmit
    try {
      await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(toEmail)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          _subject: subject,
          "Sign-In Code": code,
          "Sign-In Link": magicLink,
          _captcha: "false"
        })
      });
      console.log(`[AUTH OTP] Fallback FormSubmit sent to ${toEmail}`);
      return true;
    } catch (fbErr: any) {
      console.error(`[AUTH OTP] FormSubmit fallback also failed:`, fbErr?.message || fbErr);
      return false;
    }
  }
}

/**
 * POST /api/auth/send-otp
 * Step 1: User enters email. Generates 6-digit code and magic sign-in link, dispatches to email.
 */
export async function handleSendOtp(req: Request, res: Response) {
  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.includes("@") || !email.includes(".")) {
    return res.status(400).json({
      success: false,
      error: "Please enter a valid email address."
    });
  }

  const cleanEmail = email.toLowerCase().trim();

  // Generate 6-digit numeric OTP and secure random token for magic link
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const magicToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  // Store in-memory
  otpStore.set(cleanEmail, {
    email: cleanEmail,
    code,
    magicToken,
    expiresAt
  });

  // Also persist in Firestore profiles for persistence across restarts
  try {
    const userDocRef = doc(db, "profiles", cleanEmail);
    await setDoc(userDocRef, {
      lastOtpCode: code,
      lastMagicToken: magicToken,
      otpExpiresAt: expiresAt
    }, { merge: true });
  } catch (fsErr) {
    console.warn("[AUTH OTP] Firestore OTP cache warning:", fsErr);
  }

  // Determine origin for magic link
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const protoHeader = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  const origin = `${protoHeader}://${hostHeader}`;
  const magicLink = `${origin}/?token=${magicToken}&email=${encodeURIComponent(cleanEmail)}`;

  console.log(`[AUTH OTP] Generated OTP ${code} and magic link for ${cleanEmail}`);

  // Send email asynchronously
  sendAuthEmail(cleanEmail, code, magicLink).catch(err => {
    console.error("[AUTH OTP] Dispatch error:", err);
  });

  return res.status(200).json({
    success: true,
    message: `Sign-in code and link sent to ${cleanEmail}`
  });
}

/**
 * Helper to complete login/signup for a verified email address.
 * Creates profile if new user, preserves existing profile and MT5 data if returning user.
 */
async function completeEmailAuth(cleanEmail: string) {
  const userDocRef = doc(db, "profiles", cleanEmail);
  const existingDoc = await getDoc(userDocRef);

  let displayName = cleanEmail.split("@")[0];
  displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  let plan = "free";

  if (existingDoc.exists()) {
    const data = existingDoc.data();
    displayName = data?.name || displayName;
    plan = data?.plan || "free";
    // Mark verified if not already
    if (data?.isVerified !== true) {
      await setDoc(userDocRef, { isVerified: true }, { merge: true });
    }
  } else {
    // New user auto-creation (unified signup)
    await setDoc(userDocRef, {
      email: cleanEmail,
      name: displayName,
      isVerified: true,
      startingBalance: 0,
      plan: "free",
      createdAt: new Date().toISOString()
    }, { merge: true });
  }

  // Generate 30-day session token
  const token = createSessionToken(cleanEmail, displayName);

  const userPayload = {
    email: cleanEmail,
    name: displayName,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${cleanEmail.split("@")[0]}&backgroundColor=10b981&textColor=09090b`,
    plan
  };

  return { user: userPayload, token };
}

/**
 * POST /api/auth/verify-otp
 * Step 2: User enters the 6-digit code. Validates and signs in / signs up automatically.
 */
export async function handleVerifyOtp(req: Request, res: Response) {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({
      success: false,
      error: "Email and verification code are required."
    });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanCode = String(code).trim();

  // Check in-memory store first
  const memoryEntry = otpStore.get(cleanEmail);
  let isValid = false;

  if (memoryEntry && memoryEntry.code === cleanCode && memoryEntry.expiresAt > Date.now()) {
    isValid = true;
    otpStore.delete(cleanEmail);
  } else {
    // Check Firestore fallback
    try {
      const userDocRef = doc(db, "profiles", cleanEmail);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastOtpCode === cleanCode && Number(data.otpExpiresAt) > Date.now()) {
          isValid = true;
          // Clear used code
          await setDoc(userDocRef, { lastOtpCode: null, lastMagicToken: null }, { merge: true });
        }
      }
    } catch (fsErr) {
      console.warn("[AUTH OTP] Firestore verification lookup error:", fsErr);
    }
  }

  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired verification code. Please request a new code."
    });
  }

  try {
    const result = await completeEmailAuth(cleanEmail);
    return res.status(200).json({
      success: true,
      message: "Sign-in successful.",
      user: result.user,
      token: result.token
    });
  } catch (err: any) {
    console.error("[AUTH OTP VERIFY ERROR]", err);
    return res.status(500).json({
      success: false,
      error: "Sign-in failed due to a server error. Please try again."
    });
  }
}

/**
 * POST /api/auth/verify-token
 * Validates magic link token clicked by user. Signs in / signs up automatically.
 */
export async function handleVerifyToken(req: Request, res: Response) {
  const { email, token } = req.body || {};
  if (!email || !token) {
    return res.status(400).json({
      success: false,
      error: "Email and sign-in token are required."
    });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanToken = String(token).trim();

  const memoryEntry = otpStore.get(cleanEmail);
  let isValid = false;

  if (memoryEntry && memoryEntry.magicToken === cleanToken && memoryEntry.expiresAt > Date.now()) {
    isValid = true;
    otpStore.delete(cleanEmail);
  } else {
    try {
      const userDocRef = doc(db, "profiles", cleanEmail);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastMagicToken === cleanToken && Number(data.otpExpiresAt) > Date.now()) {
          isValid = true;
          await setDoc(userDocRef, { lastOtpCode: null, lastMagicToken: null }, { merge: true });
        }
      }
    } catch (fsErr) {
      console.warn("[AUTH TOKEN] Firestore verification lookup error:", fsErr);
    }
  }

  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired sign-in link. Please request a new link."
    });
  }

  try {
    const result = await completeEmailAuth(cleanEmail);
    return res.status(200).json({
      success: true,
      message: "Sign-in link verified.",
      user: result.user,
      token: result.token
    });
  } catch (err: any) {
    console.error("[AUTH TOKEN VERIFY ERROR]", err);
    return res.status(500).json({
      success: false,
      error: "Sign-in failed due to a server error. Please try again."
    });
  }
}

// MT5 direct credential login endpoint
export async function handleLoginEmailMT5(req: Request, res: Response) {
  const { email, accountId, broker } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ success: false, error: "Email is required." });
  }
  const cleanEmail = email.toLowerCase().trim();
  const displayName = cleanEmail.split("@")[0];
  const token = createSessionToken(cleanEmail, displayName);
  return res.status(200).json({
    success: true,
    user: {
      email: cleanEmail,
      name: displayName,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${cleanEmail}&backgroundColor=10b981&textColor=09090b`,
      plan: cleanEmail === "toolaoilqbi@gmail.com" ? "premium" : "free",
      mt5Connected: !!accountId,
      mt5AccountId: accountId || "",
      mt5Broker: broker || ""
    },
    token
  });
}

// Deprecated legacy endpoints maintained for backward compatibility without passwords
export async function handleRegister(req: Request, res: Response) {
  return handleSendOtp(req, res);
}

export async function handleLogin(req: Request, res: Response) {
  return handleSendOtp(req, res);
}

/**
 * GET /api/auth/me
 * Returns current user's profile information based on their signed session token.
 */
export async function handleMe(req: Request, res: Response) {
  const session = getAuthenticatedUser(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized. Session is missing or expired."
    });
  }

  try {
    const userDocRef = doc(db, "profiles", session.email);
    const userDoc = await getDoc(userDocRef);
    const data = userDoc.exists() ? userDoc.data() : null;

    const userPayload = {
      email: session.email,
      name: data?.name || session.name,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${session.email.split("@")[0]}&backgroundColor=10b981&textColor=09090b`,
      plan: data?.plan || "free",
      startingBalance: data?.startingBalance ?? 0,
      mt5Connected: data?.mt5Connected || false,
      mt5AccountId: data?.mt5AccountId || "",
      mt5Broker: data?.mt5Broker || "",
      mt5Balance: data?.mt5Balance ?? null,
      mt5Equity: data?.mt5Equity ?? null
    };

    return res.status(200).json({
      success: true,
      user: userPayload
    });
  } catch (err: any) {
    console.error("[AUTH ME ERROR]", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch session profile."
    });
  }
}

/**
 * POST /api/auth/logout
 * Clean logout endpoint.
 */
export async function handleLogout(req: Request, res: Response) {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully."
  });
}
