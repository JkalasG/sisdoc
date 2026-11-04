-- Un solo chat directo por pareja de usuarios
ALTER TABLE "conversations" ADD COLUMN "direct_key" TEXT;
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");
-- Los chats directos que ya existían reciben su clave (el más antiguo de cada pareja la conserva)
WITH pares AS (
  SELECT c.id, c.created_at,
         (SELECT string_agg(m.user_id, ':' ORDER BY m.user_id) FROM conversation_members m WHERE m.conversation_id = c.id) AS clave
  FROM conversations c WHERE c.type = 'DIRECT'
), unicos AS (
  SELECT id, clave, row_number() OVER (PARTITION BY clave ORDER BY created_at, id) AS n FROM pares WHERE clave IS NOT NULL
)
UPDATE conversations SET direct_key = unicos.clave FROM unicos WHERE conversations.id = unicos.id AND unicos.n = 1;
