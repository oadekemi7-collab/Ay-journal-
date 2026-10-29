import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import sendCodeHandler from "./api/send-code.ts";
import { handleGetConfig, handleConnectAccount, handleSyncAccount, handleConnectMT5, handleStatusAccount, handleConnectMockSandbox } from "./api/mt5.ts";
import { handleInitializePaystack, handleVerifyPaystack } from "./api/paystack.ts";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable CORS and OPTIONS handling for all API endpoints
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, auth-token, x-metaapi-token"
  );
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

// API routing for secure, backend-initiated SMTP verification mails - unified with Vercel function
app.post("/api/send-code", sendCodeHandler);

// Secure MT5 proxy endpoints
app.post("/api/connect-mt5", handleConnectMT5);
app.get("/api/mt5/config", handleGetConfig);
app.post("/api/mt5/connect", handleConnectAccount);
app.post("/api/mt5/sync", handleSyncAccount);
app.post("/api/mt5/status", handleStatusAccount);
app.post("/api/mt5/sandbox", handleConnectMockSandbox);
app.post("/api/mt5/connect-mock", handleConnectMockSandbox);

// Paystack secure subscription checkout endpoints
app.post("/api/paystack/initialize", handleInitializePaystack);
app.post("/api/paystack/verify", handleVerifyPaystack);

// Configure Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
