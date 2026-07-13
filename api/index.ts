import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import sendCodeHandler from "./send-code.ts";
import { handleGetConfig, handleConnectAccount, handleSyncAccount, handleConnectMT5 } from "./mt5.ts";
import { handleInitializePaystack, handleVerifyPaystack } from "./paystack.ts";

dotenv.config();

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

// Register routes with strict method validation to return 405 on incorrect methods
app.all("/api/send-code", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return sendCodeHandler(req, res);
});

app.all("/api/connect-mt5", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleConnectMT5(req, res);
});

app.all("/api/mt5/config", (req: Request, res: Response) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use GET." });
  }
  return handleGetConfig(req, res);
});

app.all("/api/mt5/connect", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleConnectAccount(req, res);
});

app.all("/api/mt5/sync", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleSyncAccount(req, res);
});

// Paystack secure subscription checkout endpoints
app.all("/api/paystack/initialize", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleInitializePaystack(req, res);
});

app.all("/api/paystack/verify", (req: Request, res: Response) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return handleVerifyPaystack(req, res);
});

// Fallback for unmatched API routes to ensure JSON/405/404 consistency
app.use("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.originalUrl || req.url} not found on Vercel MT5 Serverless API.`
  });
});

export default app;
