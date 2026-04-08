import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator";

class SubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class RegisterSubscriptionDto {
  @IsString()
  endpoint!: string;

  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys!: SubscriptionKeysDto;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
