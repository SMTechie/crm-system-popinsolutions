import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../../modules/auth/auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization as string | undefined;

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const token = authorization.replace("Bearer ", "");
    const payload = this.authService.verifyToken(token);
    request.user = payload;

    const incomingTenantId = request.headers["x-tenant-id"];
    if (incomingTenantId && incomingTenantId !== payload.tenantId) {
      throw new UnauthorizedException("Tenant mismatch.");
    }

    request.headers["x-tenant-id"] = payload.tenantId;

    return true;
  }
}
