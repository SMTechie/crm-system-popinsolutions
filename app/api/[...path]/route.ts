import { NextResponse } from "next/server";
import { createApplication } from "../../../apps/api/src/app-factory";

export const runtime = "nodejs";
export const maxDuration = 60;

type LambdaResponse = {
  statusCode?: number;
  headers?: Record<string, string | number | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

type ServerlessHandler = (event: Record<string, unknown>, context: Record<string, unknown>) => Promise<LambdaResponse>;

let handlerPromise: Promise<ServerlessHandler> | undefined;

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = createApplication().then((app) => {
      // serverless-http adapts the existing Nest/Express application to Vercel's
      // request lifecycle while preserving multipart uploads and raw request bodies.
      const serverless = require("serverless-http") as (expressApp: unknown) => ServerlessHandler;
      return serverless(app.getHttpAdapter().getInstance());
    });
  }
  return handlerPromise;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const body = request.method === "GET" || request.method === "HEAD" ? "" : Buffer.from(await request.arrayBuffer()).toString("base64");
  const event = {
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(request.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: body || null,
    isBase64Encoded: Boolean(body),
    requestContext: { http: { method: request.method, path: url.pathname } },
  };
  const result = await (await getHandler())(event, {});
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    if (value !== undefined) headers.set(name, String(value));
  }
  const responseBody = result.isBase64Encoded && result.body ? Buffer.from(result.body, "base64") : result.body ?? "";
  return new NextResponse(responseBody, { status: result.statusCode ?? 200, headers });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
