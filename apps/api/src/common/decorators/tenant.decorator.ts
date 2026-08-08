import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.headers["x-tenant-id"] ?? "demo-tenant";
});

