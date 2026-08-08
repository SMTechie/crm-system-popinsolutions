import { NestFactory } from "@nestjs/core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.enableCors();
  const uploadDir = resolve(process.cwd(), "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use("/uploads", require("express").static(uploadDir));
  await app.listen(4000);
}

bootstrap();
