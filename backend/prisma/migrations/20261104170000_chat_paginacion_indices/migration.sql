-- Paginación por claves del historial y consultas de la lista de chats sin recorrer todo el historial.
DROP INDEX IF EXISTS "messages_conversation_id_created_at_idx";
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");
CREATE INDEX "messages_author_id_idx" ON "messages"("author_id");
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");
