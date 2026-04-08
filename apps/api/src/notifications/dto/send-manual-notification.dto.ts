import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class SendManualNotificationDto {
  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds!: string[];
}
