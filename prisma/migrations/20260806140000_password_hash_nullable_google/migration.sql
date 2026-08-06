-- Los usuarios que inician sesión con Google no tienen contraseña.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
