import { Module } from "@nestjs/common";
import { FieldFormsController } from "./field-forms.controller";
import { FieldFormsService } from "./field-forms.service";

@Module({
  controllers: [FieldFormsController],
  providers: [FieldFormsService],
  exports: [FieldFormsService]
})
export class FieldFormsModule {}
