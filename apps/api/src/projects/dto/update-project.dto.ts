import { Type } from "class-transformer";
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString
} from "class-validator";

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  locationLabel?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isArchived?: boolean;
}
