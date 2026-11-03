-- Versionado mayor.menor: archivo subido = 2.0; edición en línea = 1.1, 1.2…
ALTER TABLE "documentos" ADD COLUMN "version_menor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "documento_versiones" ADD COLUMN "numero_version_menor" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "documento_versiones_documento_id_numero_version_key";
CREATE UNIQUE INDEX "documento_versiones_documento_id_numero_version_numero_vers_key"
  ON "documento_versiones"("documento_id", "numero_version", "numero_version_menor");
