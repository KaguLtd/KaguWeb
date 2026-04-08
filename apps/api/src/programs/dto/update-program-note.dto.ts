import { IsOptional, IsString } from "class-validator";

export class UpdateProgramNoteDto {
  @IsOptional()
  @IsString()
  managerNote?: string;
}
