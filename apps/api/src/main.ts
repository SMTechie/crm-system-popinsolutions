import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: process.env.WEB_APP_URL || "http://localhost:3000", credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    next();
  });
  const rateWindow = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const rateMax = Number(process.env.RATE_LIMIT_MAX || 300);
  const rateState = new Map<string, { count: number; resetAt: number }>();
  app.use((request: { ip?: string; path?: string }, response: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (name: string, value: string) => void }, next: () => void) => {
    const key = `${request.ip ?? "unknown"}:${request.path ?? "unknown"}`;
    const now = Date.now();
    const current = rateState.get(key);
    const state = !current || current.resetAt <= now ? { count: 0, resetAt: now + rateWindow } : current;
    state.count += 1;
    rateState.set(key, state);
    response.setHeader("X-RateLimit-Limit", String(rateMax));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, rateMax - state.count)));
    if (state.count > rateMax) { response.status(429).json({ statusCode: 429, message: "Too many requests. Try again shortly." }); return; }
    next();
  });
  if (process.env.NODE_ENV !== "production" || process.env.STORAGE_PROVIDER === "local") {
    const uploadDir = resolve(process.cwd(), "uploads");
    mkdirSync(uploadDir, { recursive: true });
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use("/uploads", require("express").static(uploadDir));
  }
  await app.listen(4000);
}

bootstrap();
