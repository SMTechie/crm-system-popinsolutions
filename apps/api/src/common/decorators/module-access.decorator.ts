import { SetMetadata } from "@nestjs/common";

export const MODULE_ACCESS_KEY = "moduleAccessKey";

export function ModuleAccess(moduleKey: string) {
  return SetMetadata(MODULE_ACCESS_KEY, moduleKey);
}
