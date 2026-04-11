import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const jobExecutionStatusValues = ["RUNNING", "SUCCEEDED", "FAILED"] as const;

export class ListJobExecutionsQueryDto {
  @IsOptional()
  @IsString()
  jobName?: string;

  @IsOptional()
  @IsIn(jobExecutionStatusValues)
  status?: (typeof jobExecutionStatusValues)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
