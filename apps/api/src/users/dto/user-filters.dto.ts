import { IsIn, IsOptional, IsString } from "class-validator";
import { Role } from "@prisma/client";

export class UserFiltersDto {
  @IsOptional()
  role?: Role;

  @IsOptional()
  @IsIn(["active", "inactive", "all"])
  status?: "active" | "inactive" | "all";

  @IsOptional()
  @IsString()
  query?: string;
}
