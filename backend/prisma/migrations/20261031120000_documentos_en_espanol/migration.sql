-- Documentos en español (sin tildes ni eñes): tablas, columnas, estados y campos del registro maestro.
-- Las tablas de documentos estaban vacías al aplicar esta migración (solo datos de desarrollo).

-- CreateEnum
CREATE TYPE "estado_documento" AS ENUM ('borrador', 'revisado', 'en_revision', 'aprobado', 'rechazado', 'archivado');

-- CreateEnum
CREATE TYPE "decision_revision" AS ENUM ('pendiente', 'aprobado', 'rechazado', 'cambios_solicitados');

-- CreateEnum
CREATE TYPE "permiso_comparticion" AS ENUM ('ver', 'descargar', 'editar');

-- CreateEnum
CREATE TYPE "accion_documento" AS ENUM ('subir', 'nueva_version', 'ver', 'descargar', 'compartir', 'dejar_de_compartir', 'revision_solicitada', 'revision_decidida', 'estado_cambiado', 'eliminar', 'restaurar');

-- CreateEnum
CREATE TYPE "si_no" AS ENUM ('si', 'no');

-- DropForeignKey
ALTER TABLE "document_access_logs" DROP CONSTRAINT "document_access_logs_document_id_fkey";

-- DropForeignKey
ALTER TABLE "document_reviews" DROP CONSTRAINT "document_reviews_document_id_fkey";

-- DropForeignKey
ALTER TABLE "document_reviews" DROP CONSTRAINT "document_reviews_version_id_fkey";

-- DropForeignKey
ALTER TABLE "document_shares" DROP CONSTRAINT "document_shares_document_id_fkey";

-- DropForeignKey
ALTER TABLE "document_versions" DROP CONSTRAINT "document_versions_document_id_fkey";

-- DropTable
DROP TABLE "document_access_logs";

-- DropTable
DROP TABLE "document_reviews";

-- DropTable
DROP TABLE "document_shares";

-- DropTable
DROP TABLE "document_versions";

-- DropTable
DROP TABLE "documents";

-- DropEnum
DROP TYPE "DocumentAction";

-- DropEnum
DROP TYPE "DocumentStatus";

-- DropEnum
DROP TYPE "ReviewDecision";

-- DropEnum
DROP TYPE "SharePermission";

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre_documento" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "estado_documento" NOT NULL DEFAULT 'borrador',
    "gestion" INTEGER NOT NULL,
    "cambios" "si_no" NOT NULL DEFAULT 'no',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creador_id" TEXT NOT NULL,
    "fecha_modificacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificador_id" TEXT NOT NULL,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_actualizador_id" TEXT NOT NULL,
    "revisor_id" TEXT,
    "url_word" TEXT,
    "url_pdf" TEXT,
    "version_vigente_id" TEXT,
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_versiones" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "numero_version" INTEGER NOT NULL,
    "clave_almacenamiento" TEXT NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamano_bytes" BIGINT NOT NULL,
    "suma_sha256" TEXT NOT NULL,
    "nota_cambio" TEXT,
    "subido_por_id" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_comparticiones" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "permiso" "permiso_comparticion" NOT NULL,
    "compartido_por_id" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_comparticiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_revisiones" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "solicitado_por_id" TEXT NOT NULL,
    "revisor_id" TEXT NOT NULL,
    "decision" "decision_revision" NOT NULL DEFAULT 'pendiente',
    "comentario" TEXT,
    "solicitado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_en" TIMESTAMP(3),

    CONSTRAINT "documento_revisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_bitacora_accesos" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "version_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "accion" "accion_documento" NOT NULL,
    "ip" TEXT,
    "agente_usuario" TEXT,
    "canal" TEXT,
    "metadatos" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_bitacora_accesos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_codigo_key" ON "documentos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_version_vigente_id_key" ON "documentos"("version_vigente_id");

-- CreateIndex
CREATE INDEX "documentos_usuario_creador_id_idx" ON "documentos"("usuario_creador_id");

-- CreateIndex
CREATE INDEX "documentos_gestion_idx" ON "documentos"("gestion");

-- CreateIndex
CREATE UNIQUE INDEX "documento_versiones_documento_id_numero_version_key" ON "documento_versiones"("documento_id", "numero_version");

-- CreateIndex
CREATE UNIQUE INDEX "documento_comparticiones_documento_id_usuario_id_key" ON "documento_comparticiones"("documento_id", "usuario_id");

-- CreateIndex
CREATE INDEX "documento_revisiones_revisor_id_decision_idx" ON "documento_revisiones"("revisor_id", "decision");

-- CreateIndex
CREATE INDEX "documento_bitacora_accesos_documento_id_creado_en_idx" ON "documento_bitacora_accesos"("documento_id", "creado_en");

-- CreateIndex
CREATE INDEX "documento_bitacora_accesos_usuario_id_creado_en_idx" ON "documento_bitacora_accesos"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "documento_bitacora_accesos_accion_creado_en_idx" ON "documento_bitacora_accesos"("accion", "creado_en");

-- AddForeignKey
ALTER TABLE "documento_versiones" ADD CONSTRAINT "documento_versiones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_comparticiones" ADD CONSTRAINT "documento_comparticiones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_revisiones" ADD CONSTRAINT "documento_revisiones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_revisiones" ADD CONSTRAINT "documento_revisiones_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "documento_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_bitacora_accesos" ADD CONSTRAINT "documento_bitacora_accesos_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

