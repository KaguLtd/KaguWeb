import { Type } from "class-transformer";
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString
} from "class-validator";

export class CreateProjectDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}
