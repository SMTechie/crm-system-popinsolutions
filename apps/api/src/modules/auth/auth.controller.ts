import { Body, Controller, Get, Headers, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { parseInput } from "../../common/validation";
import { AuthService } from "./auth.service";

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1), tenantId: z.string().trim().min(3).optional() });
const signupSchema = z.object({ workspaceName: z.string().trim().min(2), workspaceSlug: z.string().trim().min(3).optional(), ownerName: z.string().trim().min(2), ownerEmail: z.string().trim().email(), password: z.string().min(10), planCode: z.enum(["starter", "growth", "enterprise"]).optional() });
const resetRequestSchema = z.object({ email: z.string().trim().email(), tenantId: z.string().trim().min(3).optional() });
const resetSchema = z.object({ token: z.string().min(20), password: z.string().min(10) });
const tokenSchema = z.object({ token: z.string().min(20) });
const oauthCodeSchema = z.object({ code: z.string().min(20) });

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private cookieValue(cookieHeader: string | undefined, name: string) {
    return cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  }

  private setAuthCookies(response: { setHeader: (name: string, value: string | string[]) => void }, accessToken: string, refreshToken?: string) {
    const secure = process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
    const suffix = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
    const cookies = [`popin_access=${accessToken}; Max-Age=28800; ${suffix}`];
    if (refreshToken) cookies.push(`popin_refresh=${refreshToken}; Max-Age=2592000; ${suffix}`);
    response.setHeader("Set-Cookie", cookies);
  }

  private clearAuthCookies(response: { setHeader: (name: string, value: string | string[]) => void }) {
    response.setHeader("Set-Cookie", ["popin_access=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax", "popin_refresh=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"]);
  }

  @Post("login")
  login(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader: (name: string, value: string | string[]) => void }) {
    const input = parseInput(loginSchema, body);
    return this.authService.login(
      input.email,
      input.password,
      input.tenantId ?? "demo-tenant",
    ).then((result) => { this.setAuthCookies(response, result.accessToken, result.refreshToken); return result; });
  }

  @Get("workspace-availability")
  workspaceAvailability(@Headers("x-workspace-slug") workspaceSlug?: string) {
    return this.authService.workspaceAvailability(workspaceSlug ?? "");
  }

  @Post("signup")
  signup(
    @Body()
    body: unknown,
  ) {
    return this.authService.signup(parseInput(signupSchema, body));
  }

  @Post("refresh")
  refresh(@Headers("authorization") authorization?: string, @Headers("cookie") cookieHeader?: string, @Res({ passthrough: true }) response?: { setHeader: (name: string, value: string | string[]) => void }) {
    const refreshToken = authorization?.startsWith("Bearer ") ? authorization.replace("Bearer ", "") : this.cookieValue(cookieHeader, "popin_refresh");
    if (!refreshToken) {
      throw new UnauthorizedException("Missing bearer token.");
    }
    return this.authService.refresh(refreshToken).then((result) => { if (response) this.setAuthCookies(response, result.accessToken, result.refreshToken); return result; });
  }

  @Post("logout")
  logout(@Headers("authorization") authorization?: string, @Headers("cookie") cookieHeader?: string, @Res({ passthrough: true }) response?: { setHeader: (name: string, value: string | string[]) => void }) {
    const refreshToken = authorization?.startsWith("Bearer ") ? authorization.replace("Bearer ", "") : this.cookieValue(cookieHeader, "popin_refresh");
    if (!refreshToken) throw new UnauthorizedException("Missing refresh session.");
    return this.authService.logout(refreshToken).then((result) => { if (response) this.clearAuthCookies(response); return result; });
  }

  @Post("password-reset/request")
  requestPasswordReset(@Body() body: unknown) { const input = parseInput(resetRequestSchema, body); return this.authService.requestPasswordReset(input.email, input.tenantId ?? "demo-tenant"); }

  @Post("password-reset/confirm")
  resetPassword(@Body() body: unknown) { const input = parseInput(resetSchema, body); return this.authService.resetPassword(input.token, input.password); }

  @Post("verify-email")
  verifyEmail(@Body() body: unknown) { return this.authService.verifyEmail(parseInput(tokenSchema, body).token); }

  @Get("me")
  me(@Headers("authorization") authorization?: string, @Headers("cookie") cookieHeader?: string) {
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.replace("Bearer ", "") : this.cookieValue(cookieHeader, "popin_access");
    if (!accessToken) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const payload = this.authService.verifyToken(accessToken);
    return this.authService.me(payload.sub);
  }

  @Get("oauth/google")
  google(@Headers("x-workspace-slug") workspaceSlug?: string) { return this.authService.oauthAuthorization("google", workspaceSlug); }

  @Get("oauth/google/callback")
  async googleCallback(@Query("code") code?: string, @Query("state") state?: string, @Res() response?: { redirect: (url: string) => void }) { const result = await this.authService.oauthCallback("google", code ?? "", state ?? ""); response?.redirect(`${process.env.WEB_APP_URL || "http://localhost:3000"}/auth/oauth/callback?code=${encodeURIComponent(result.code)}`); }

  @Post("oauth/exchange")
  exchangeOAuthCode(@Body() body: unknown) { return this.authService.exchangeOAuthCode(parseInput(oauthCodeSchema, body).code); }

  @Get("oauth/microsoft")
  microsoft(@Headers("x-workspace-slug") workspaceSlug?: string) { return this.authService.oauthAuthorization("microsoft", workspaceSlug); }

  @Get("oauth/microsoft/callback")
  async microsoftCallback(@Query("code") code?: string, @Query("state") state?: string, @Res() response?: { redirect: (url: string) => void }) { const result = await this.authService.oauthCallback("microsoft", code ?? "", state ?? ""); response?.redirect(`${process.env.WEB_APP_URL || "http://localhost:3000"}/auth/oauth/callback?code=${encodeURIComponent(result.code)}`); }
}
