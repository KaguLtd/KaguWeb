import { IsOptional, IsString } from "class-validator";

export class FieldFormResponseFiltersDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;
}
