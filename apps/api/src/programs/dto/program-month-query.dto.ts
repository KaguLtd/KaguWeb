import { IsOptional, Matches } from "class-validator";

export class ProgramMonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/u)
  month?: string;
}
