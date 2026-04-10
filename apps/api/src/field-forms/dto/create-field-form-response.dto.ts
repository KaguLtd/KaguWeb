import { IsObject, IsOptional, IsString, Length } from "class-validator";

export class CreateFieldFormResponseDto {
  @IsString()
  @Length(1, 120)
  templateVersionId!: string;

  @IsString()
  @Length(1, 120)
  projectId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  dailyProgramProjectId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  projectEntryId?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
