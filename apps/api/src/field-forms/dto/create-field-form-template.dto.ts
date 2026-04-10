import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { FieldFormFieldType } from "@prisma/client";

export class FieldFormFieldDto {
  @IsString()
  @Length(1, 120)
  key!: string;

  @IsString()
  @Length(1, 120)
  label!: string;

  @IsEnum(FieldFormFieldType)
  type!: FieldFormFieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

export class FieldFormSchemaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldFormFieldDto)
  fields!: FieldFormFieldDto[];
}

export class CreateFieldFormTemplateDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @Length(2, 120)
  versionTitle!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => FieldFormSchemaDto)
  schema!: FieldFormSchemaDto;
}
