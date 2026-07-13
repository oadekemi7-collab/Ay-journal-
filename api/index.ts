import express, { Request, Response, NextFunction } from "express";

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

// Minimal handler for debugging Vercel Serverless Function deployment
app.all("/api/connect-mt5", (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "Serverless function is running."
  });
});

app.all("/api/mt5/config", (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "Serverless function config is running."
  });
});

// Fallback for unmatched API routes
app.use("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.originalUrl || req.url} not found on Vercel MT5 Serverless API.`
  });
});

export default app;
