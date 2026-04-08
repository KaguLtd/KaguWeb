import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";

export class LocationPingDto {
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsString()
  source?: string;
}

