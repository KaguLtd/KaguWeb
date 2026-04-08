import { IsOptional, IsString } from "class-validator";

export class ProjectDurationReportQueryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
