import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class UpdateFieldFormTemplateDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsBoolean()
  isActive!: boolean;
}
