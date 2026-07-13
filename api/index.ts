import express, { Request, Response, NextFunction } from "express";
import sendCodeHandler from "./send-code.ts";
import { 
  handleGetConfig, 
  handleConnectMT5, 
  handleConnectAccount, 
  handleSyncAccount 
} from "./mt5.ts";
import { 
  handleInitializePaystack, 
  handleVerifyPaystack 
} from "./paystack.ts";

const app = express();
app.use(express.json());

// Enable CORS and OPTIONS handling
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

// 1. send-code (POST only)
app.all("/api/send-code", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return sendCodeHandler(req, res);
});

// 2. connect-mt5 (POST only)
app.all("/api/connect-mt5", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleConnectMT5(req, res);
});

// 3. mt5/config (GET only)
app.all("/api/mt5/config", (req: Request, res: Response) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use GET." });
  }
  return handleGetConfig(req, res);
});

// 4. mt5/connect (POST only)
app.all("/api/mt5/connect", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleConnectAccount(req, res);
});

// 5. mt5/sync (POST only)
app.all("/api/mt5/sync", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleSyncAccount(req, res);
});

// 6. paystack/initialize (POST only)
app.all("/api/paystack/initialize", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleInitializePaystack(req, res);
});

// 7. paystack/verify (POST only)
app.all("/api/paystack/verify", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleVerifyPaystack(req, res);
});

// Fallback for unmatched API routes
app.use("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.originalUrl || req.url} not found on Vercel MT5 Serverless API.`
  });
});

export default app;
