import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";

export class WorkSessionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
}

