import { Module } from "@nestjs/common";
import { AccountingController } from "./accounting.controller";
import { AccountingPostingService } from "./accounting-posting.service";

@Module({
  controllers: [AccountingController],
  providers: [AccountingPostingService],
})
export class AccountingModule {}
