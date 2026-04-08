import { IsOptional, Matches } from "class-validator";

export class SendDailyReminderDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  date?: string;
}
