import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApplication } from "../apps/api/src/app-factory";

let application: ReturnType<typeof createApplication> | undefined;

async function getApplication() {
  application ??= createApplication();
  return application;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const app = await getApplication();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(request, response);
}
