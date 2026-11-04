-- Respuestas, ediciones, imágenes y acuses (entregado / leído) con fecha y hora para trazabilidad.
ALTER TABLE "messages" ADD COLUMN "reply_to_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "edited_at" TIMESTAMPTZ(3);
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

CREATE TABLE "message_images" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "conversation_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_images_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_images_storage_key_key" ON "message_images"("storage_key");
CREATE INDEX "message_images_message_id_idx" ON "message_images"("message_id");
CREATE INDEX "message_images_conversation_id_uploader_id_message_id_idx" ON "message_images"("conversation_id", "uploader_id", "message_id");
ALTER TABLE "message_images" ADD CONSTRAINT "message_images_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "message_receipts" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("message_id","user_id")
);
CREATE INDEX "message_receipts_user_id_delivered_at_idx" ON "message_receipts"("user_id", "delivered_at");
CREATE INDEX "message_receipts_user_id_read_at_idx" ON "message_receipts"("user_id", "read_at");
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "message_edits" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "editor_id" TEXT NOT NULL,
    "previous_content" TEXT,
    "edited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_edits_message_id_edited_at_idx" ON "message_edits"("message_id", "edited_at");
ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mensajes anteriores a esta migración: un acuse por destinatario. Lo que el sistema NO sabe no se inventa:
--   · si el destinatario ya había leído la conversación (last_read_at), se toma esa hora como entrega y lectura;
--   · si no, queda pendiente y se registrará con la hora REAL en que se conecte o la abra.
INSERT INTO "message_receipts" ("message_id", "user_id", "delivered_at", "read_at")
SELECT m."id", cm."user_id",
       CASE WHEN cm."last_read_at" IS NOT NULL AND m."created_at" <= cm."last_read_at" THEN cm."last_read_at" END,
       CASE WHEN cm."last_read_at" IS NOT NULL AND m."created_at" <= cm."last_read_at" THEN cm."last_read_at" END
  FROM "messages" m
  JOIN "conversation_members" cm ON cm."conversation_id" = m."conversation_id" AND cm."user_id" <> m."author_id";
