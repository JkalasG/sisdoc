-- Acceso con Google: identificador estable ("sub") de la cuenta de Google vinculada
ALTER TABLE "users" ADD COLUMN "google_sub" TEXT;
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
