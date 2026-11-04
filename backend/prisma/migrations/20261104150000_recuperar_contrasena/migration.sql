-- Recuperación de contraseña por código de un solo uso (OTP) enviado por correo
CREATE TABLE "password_reset_codes" (
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_in_window" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
