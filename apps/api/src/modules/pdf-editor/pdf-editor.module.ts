import { Module } from "@nestjs/common";
import { PdfEditorController } from "./pdf-editor.controller";

@Module({ controllers: [PdfEditorController] })
export class PdfEditorModule {}
