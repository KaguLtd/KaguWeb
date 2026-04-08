import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ProjectFiltersDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(["active", "archived", "all"])
  status?: "active" | "archived" | "all";
}
