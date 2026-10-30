-- Todas las fechas guardan fecha Y hora con zona horaria (TIMESTAMPTZ). Los valores existentes se guardaron en UTC.

-- AlterTable
ALTER TABLE "conversation_members" ALTER COLUMN "last_read_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_read_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "first_seen_at" SET DATA TYPE TIMESTAMPTZ(3) USING "first_seen_at" AT TIME ZONE 'UTC',
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_seen_at" AT TIME ZONE 'UTC',
ALTER COLUMN "decided_at" SET DATA TYPE TIMESTAMPTZ(3) USING "decided_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "documento_bitacora_accesos" ALTER COLUMN "creado_en" SET DATA TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "documento_comparticiones" ALTER COLUMN "expira_en" SET DATA TYPE TIMESTAMPTZ(3) USING "expira_en" AT TIME ZONE 'UTC',
ALTER COLUMN "creado_en" SET DATA TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "documento_revisiones" ALTER COLUMN "solicitado_en" SET DATA TYPE TIMESTAMPTZ(3) USING "solicitado_en" AT TIME ZONE 'UTC',
ALTER COLUMN "decidido_en" SET DATA TYPE TIMESTAMPTZ(3) USING "decidido_en" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "documento_versiones" ALTER COLUMN "creado_en" SET DATA TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "documentos" ALTER COLUMN "fecha_creacion" SET DATA TYPE TIMESTAMPTZ(3) USING "fecha_creacion" AT TIME ZONE 'UTC',
ALTER COLUMN "fecha_modificacion" SET DATA TYPE TIMESTAMPTZ(3) USING "fecha_modificacion" AT TIME ZONE 'UTC',
ALTER COLUMN "fecha_actualizacion" SET DATA TYPE TIMESTAMPTZ(3) USING "fecha_actualizacion" AT TIME ZONE 'UTC',
ALTER COLUMN "eliminado_en" SET DATA TYPE TIMESTAMPTZ(3) USING "eliminado_en" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "password_history" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "security_events" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "last_activity_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_activity_at" AT TIME ZONE 'UTC',
ALTER COLUMN "absolute_expires_at" SET DATA TYPE TIMESTAMPTZ(3) USING "absolute_expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "revoked_at" SET DATA TYPE TIMESTAMPTZ(3) USING "revoked_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMPTZ(3) USING "locked_until" AT TIME ZONE 'UTC',
ALTER COLUMN "password_changed_at" SET DATA TYPE TIMESTAMPTZ(3) USING "password_changed_at" AT TIME ZONE 'UTC',
ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

