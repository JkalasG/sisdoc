-- Ventana de gracia del refresh: hora de la última rotación del token
ALTER TABLE "sessions" ADD COLUMN "rotated_at" TIMESTAMPTZ(3);
