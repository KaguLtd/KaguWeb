import { IsDateString } from "class-validator";

export class CreateDailyProgramDto {
  @IsDateString()
  date!: string;
}

