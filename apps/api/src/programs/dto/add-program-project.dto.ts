import { IsOptional, IsString } from "class-validator";

export class AddProgramProjectDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

