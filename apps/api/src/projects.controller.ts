import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";
import { ProjectsService } from "./projects.service";

class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Post()
  create(@Body() body: CreateProjectDto) {
    // Production hardening must add SSRF-safe URL resolution and network egress controls.
    return this.projects.create(body);
  }
}
