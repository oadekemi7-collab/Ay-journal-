import "./patch";
import dotenv from "dotenv";
try {
  dotenv.config();
} catch (envErr) {
  console.error("Failed to load .env configuration:", envErr);
}

import express, { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

// Helper to wrap handlers dynamically and catch module loading or runtime errors
function wrapDynamic(importPromise: () => Promise<any>, methodName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const module = await importPromise();
      const handler = module[methodName];
      if (!handler) {
        throw new Error(`Handler '${methodName}' was not found in the dynamically imported module.`);
      }
      return await handler(req, res, next);
    } catch (err: any) {
      console.error(`[CRITICAL HANDLER ERROR] [${methodName}] Caught exception:`, err);
      
      const statusCode = err.status || err.statusCode || 500;
      
      // Determine filename and line number if possible from stack trace
      let fileName = "Unknown file";
      let lineNumber = "Unknown line";
      if (err.stack) {
        try {
          const lines = err.stack.split("\n");
          // Look for any line containing our project path or api files
          const traceLine = lines.find((l: string) => l.includes("api/") || l.includes("src/"));
          if (traceLine) {
            const match = traceLine.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/) || traceLine.match(/at\s+(.+):(\d+):(\d+)/);
            if (match) {
              fileName = match[2] || match[1];
              lineNumber = `${match[3] || match[2]}:${match[4] || match[3]}`;
            } else {
              fileName = traceLine.trim();
            }
          }
        } catch (e) {
          console.error("Failed to parse stack trace:", e);
        }
      }

      return res.status(statusCode).json({
        success: false,
        error: `Vercel Serverless Exception [${methodName}]: ${err.message || String(err)}`,
        message: err.message || String(err),
        stack: err.stack,
        fileName,
        lineNumber,
        statusCode,
        environment: process.env.NODE_ENV || "development"
      });
    }
  };
}

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
app.all("/api/send-code", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./send-code"), "default")(req, res, next);
});

// 2. connect-mt5 (POST only)
app.all("/api/connect-mt5", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./mt5"), "handleConnectMT5")(req, res, next);
});

// 3. mt5/config (GET only)
app.all("/api/mt5/config", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use GET." });
  }
  return wrapDynamic(() => import("./mt5"), "handleGetConfig")(req, res, next);
});

// 4. mt5/connect (POST only)
app.all("/api/mt5/connect", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./mt5"), "handleConnectAccount")(req, res, next);
});

// 5. mt5/sync (POST only)
app.all("/api/mt5/sync", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./mt5"), "handleSyncAccount")(req, res, next);
});

// 5b. mt5/status (POST only)
app.all("/api/mt5/status", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./mt5"), "handleStatusAccount")(req, res, next);
});

// 6. paystack/initialize (POST only)
app.all("/api/paystack/initialize", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./paystack"), "handleInitializePaystack")(req, res, next);
});

// 7. paystack/verify (POST only)
app.all("/api/paystack/verify", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed. Use POST." });
  }
  return wrapDynamic(() => import("./paystack"), "handleVerifyPaystack")(req, res, next);
});

// Fallback for unmatched API routes
app.use("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.originalUrl || req.url} not found on Vercel MT5 Serverless API.`
  });
});

// Express error handling middleware to capture any other uncaught errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[UNCAUGHT EXPRESS ERROR]", err);
  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: `Uncaught Express Error: ${err.message || String(err)}`,
    message: err.message || String(err),
    stack: err.stack,
    statusCode
  });
});

export default app;
