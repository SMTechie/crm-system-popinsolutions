import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller";
import { NotificationsService } from "./notifications.service";

@Module({ controllers: [OperationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class OperationsModule {}
