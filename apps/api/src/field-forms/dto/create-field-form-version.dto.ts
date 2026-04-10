import { IsObject, IsString, Length, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { FieldFormFieldDto } from "./create-field-form-template.dto";

class FieldFormVersionSchemaDto {
  @ValidateNested({ each: true })
  @Type(() => FieldFormFieldDto)
  fields!: FieldFormFieldDto[];
}

export class CreateFieldFormVersionDto {
  @IsString()
  @Length(2, 120)
  title!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => FieldFormVersionSchemaDto)
  schema!: FieldFormVersionSchemaDto;
}
