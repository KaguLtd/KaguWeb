import { IsOptional, IsString } from "class-validator";

export class UploadMainFileDto {
  @IsOptional()
  @IsString()
  title?: string;
}

