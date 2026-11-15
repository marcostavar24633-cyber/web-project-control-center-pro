import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { BootstrapAdminDto, LoginDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("bootstrap")
  bootstrap(@Body() body: BootstrapAdminDto, @Req() request: Request) {
    return this.auth.bootstrapAdmin({
      ...body,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });
  }

  @Post("login")
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.auth.login({
      ...body,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });
  }
}
