import { Body, Controller, Get, NotFoundException, Param, Patch, BadRequestException } from "@nestjs/common";
import { MonitoringService } from "./monitoring.service";
import { IsBoolean, IsInt, IsIn } from "class-validator";

const intervals = [5, 15, 30, 60, 180, 360, 720, 1440];

class UpdateMonitoringDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @IsIn(intervals)
  intervalMinutes!: number;
}

@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get()
  list() {
    return this.monitoring.list();
  }

  @Patch("projects/:projectId")
  async update(@Param("projectId") projectId: string, @Body() body: UpdateMonitoringDto) {
    try {
      return await this.monitoring.update(projectId, body.enabled, body.intervalMinutes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось изменить мониторинг";
      if (message === "Проект не найден") throw new NotFoundException(message);
      throw new BadRequestException(message);
    }
  }

  @Patch("events/:eventId/read")
  markRead(@Param("eventId") eventId: string) {
    return this.monitoring.markRead(eventId);
  }
}
