-- Roles de usuario (ej. ADMIN). Vacío por defecto.
ALTER TABLE "users" ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];
