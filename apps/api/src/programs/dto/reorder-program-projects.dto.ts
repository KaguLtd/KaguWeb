import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class ReorderProgramProjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds!: string[];
}
