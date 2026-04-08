import { IsArray, IsString } from "class-validator";

export class AssignFieldUsersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}
