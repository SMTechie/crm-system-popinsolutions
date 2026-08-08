import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email?: string; password?: string; tenantId?: string }) {
    return this.authService.login(
      body.email ?? "",
      body.password ?? "",
      body.tenantId ?? "demo-tenant",
    );
  }

  @Get("workspace-availability")
  workspaceAvailability(@Headers("x-workspace-slug") workspaceSlug?: string) {
    return this.authService.workspaceAvailability(workspaceSlug ?? "");
  }

  @Post("signup")
  signup(
    @Body()
    body: {
      workspaceName?: string;
      workspaceSlug?: string;
      ownerName?: string;
      ownerEmail?: string;
      password?: string;
      planCode?: string;
    },
  ) {
    return this.authService.signup(body);
  }

  @Post("refresh")
  refresh(@Headers("authorization") authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const payload = this.authService.verifyToken(authorization.replace("Bearer ", ""));
    return {
      accessToken: this.authService.signToken({
        sub: payload.sub,
        tenantId: payload.tenantId,
        email: payload.email,
        role: payload.role,
      }),
    };
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const payload = this.authService.verifyToken(authorization.replace("Bearer ", ""));
    return this.authService.me(payload.sub);
  }

  @Get("oauth/google")
  google() {
    return { provider: "google", status: "redirect-config-required" };
  }

  @Get("oauth/microsoft")
  microsoft() {
    return { provider: "microsoft", status: "redirect-config-required" };
  }
}
