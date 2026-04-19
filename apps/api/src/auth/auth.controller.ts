import {
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  AUTH_LOGIN_RATE_LIMITS,
  AUTH_LOGOUT_RATE_LIMITS,
  AUTH_PASSWORD_RATE_LIMITS,
  AUTH_REFRESH_RATE_LIMITS
} from "../common/security/rate-limit-policies";
import { RateLimit } from "../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../common/security/rate-limit.guard";
import {
  buildAccessCookie,
  buildClearedAccessCookie,
  buildClearedRefreshCookie,
  buildRefreshCookie,
  extractRefreshToken
} from "./auth-cookie";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }

  private isSecureRequest(request: Request) {
    const forwardedProto = this.headerValue(request.headers["x-forwarded-proto"]);
    return request.secure || forwardedProto === "https";
  }

  @Post("login")
  @UseGuards(RateLimitGuard)
  @RateLimit(...AUTH_LOGIN_RATE_LIMITS)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(dto, this.headerValue(request.headers["user-agent"]));
    response.setHeader("Set-Cookie", [
      buildAccessCookie(result.auth.accessToken, this.isSecureRequest(request)),
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    ]);
    return result.auth;
  }

  @Post("refresh")
  @UseGuards(RateLimitGuard)
  @RateLimit(...AUTH_REFRESH_RATE_LIMITS)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = extractRefreshToken(request.headers.cookie);
    const result = await this.authService.refresh(
      refreshToken ?? "",
      this.headerValue(request.headers["user-agent"])
    );
    response.setHeader("Set-Cookie", [
      buildAccessCookie(result.auth.accessToken, this.isSecureRequest(request)),
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    ]);
    return result.auth;
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(RateLimitGuard)
  @RateLimit(...AUTH_LOGOUT_RATE_LIMITS)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = extractRefreshToken(request.headers.cookie);
    await this.authService.logout(refreshToken);
    response.setHeader("Set-Cookie", [
      buildClearedAccessCookie(this.isSecureRequest(request)),
      buildClearedRefreshCookie(this.isSecureRequest(request))
    ]);
  }

  @Patch("password")
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(...AUTH_PASSWORD_RATE_LIMITS)
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const refreshToken = extractRefreshToken(request.headers.cookie);
    const result = await this.authService.changePassword(
      user,
      dto,
      refreshToken,
      this.headerValue(request.headers["user-agent"])
    );
    response.setHeader("Set-Cookie", [
      buildAccessCookie(result.auth.accessToken, this.isSecureRequest(request)),
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    ]);
    return result.auth;
  }
}
