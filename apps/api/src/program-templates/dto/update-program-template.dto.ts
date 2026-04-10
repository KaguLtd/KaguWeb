import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";

class UpdateProgramTemplateRuleDto {
  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];
}

class UpdateProgramTemplateProjectDto {
  @IsString()
  @Length(1, 120)
  projectId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;

  @IsArray()
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  userIds!: string[];
}

export class UpdateProgramTemplateDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  managerNote?: string;

  @IsBoolean()
  isActive!: boolean;

  @ValidateNested()
  @Type(() => UpdateProgramTemplateRuleDto)
  rule!: UpdateProgramTemplateRuleDto;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateProgramTemplateProjectDto)
  projects!: UpdateProgramTemplateProjectDto[];
}
