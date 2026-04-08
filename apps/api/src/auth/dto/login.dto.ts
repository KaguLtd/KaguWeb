import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  rememberMe?: boolean;
}
