import { IsString } from "class-validator";

export class CreateBackupRestorePrepareDto {
  @IsString()
  manifestPath!: string;
}
