import { IsDateString, IsOptional } from "class-validator";

export class ManagerDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
