import { IsOptional, IsString } from "class-validator";

export class CreateEntryDto {
  @IsOptional()
  @IsString()
  note?: string;
}

