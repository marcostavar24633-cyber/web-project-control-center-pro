import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({
      include: { environments: true },
      orderBy: { createdAt: "desc" },
    });
  }

  create(input: { name: string; description?: string; url: string }) {
    return this.prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        environments: {
          create: { name: "Production", url: input.url, type: "PRODUCTION" },
        },
      },
      include: { environments: true },
    });
  }
}
