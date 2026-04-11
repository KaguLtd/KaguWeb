import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateBackupExportDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
