import { IsDateString } from "class-validator";

export class MaterializeProgramTemplateDto {
  @IsDateString()
  date!: string;
}
