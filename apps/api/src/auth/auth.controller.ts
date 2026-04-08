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
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(dto, this.headerValue(request.headers["user-agent"]));
    response.setHeader(
      "Set-Cookie",
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    );
    return result.auth;
  }

  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = extractRefreshToken(request.headers.cookie);
    const result = await this.authService.refresh(
      refreshToken ?? "",
      this.headerValue(request.headers["user-agent"])
    );
    response.setHeader(
      "Set-Cookie",
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    );
    return result.auth;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = extractRefreshToken(request.headers.cookie);
    await this.authService.logout(refreshToken);
    response.setHeader("Set-Cookie", buildClearedRefreshCookie(this.isSecureRequest(request)));
  }

  @Patch("password")
  @UseGuards(JwtAuthGuard)
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
    response.setHeader(
      "Set-Cookie",
      buildRefreshCookie(result.refreshToken, result.rememberMe, this.isSecureRequest(request))
    );
    return result.auth;
  }
}
