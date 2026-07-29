import { loadDotEnv } from "./env.js";

loadDotEnv();

export const config = Object.freeze({
  port: Number.parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "127.0.0.1",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  useGemini: process.env.USE_GEMINI !== "false",
  maxBodyBytes: Number.parseInt(process.env.MAX_BODY_BYTES || "8000000", 10)
});
