import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException(result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
}
