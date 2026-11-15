import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private assertJwtConfigured() {
    if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
      throw new ServiceUnavailableException("JWT_ACCESS_SECRET должен содержать не менее 32 символов");
    }
  }

  private tokenMatches(candidate: string, expected: string) {
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  async bootstrapAdmin(input: {
    email: string;
    password: string;
    bootstrapToken: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const expectedToken = process.env.BOOTSTRAP_ADMIN_TOKEN;
    if (!expectedToken || expectedToken.length < 32 || !this.tokenMatches(input.bootstrapToken, expectedToken)) {
      throw new UnauthorizedException("Недействительный токен первоначальной настройки");
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.count();
        if (existing > 0) throw new ConflictException("Первоначальный администратор уже создан");

        const user = await tx.user.create({
          data: { email, passwordHash, role: "OWNER", displayName: email.split("@")[0] },
          select: { id: true, email: true, role: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "AUTH_BOOTSTRAP",
            resource: "USER",
            resourceId: user.id,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        });
        return user;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new ConflictException("Пользователь с таким email уже существует");
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string; ipAddress?: string; userAgent?: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Неверный email или пароль");

    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) throw new UnauthorizedException("Неверный email или пароль");

    this.assertJwtConfigured();
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    }, { expiresIn: "15m" });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "AUTH_LOGIN",
        resource: "USER",
        resourceId: user.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    };
  }
}
