# 🏀 RETRO HOOPS - Tournament Management System

Plataforma completa de gestión y seguimiento de torneos de básquetbol con 
estadísticas en tiempo real.

## 🎯 Características

**Gestión de Torneos**
- Crear y administrar ligas de básquetbol (3x3 a 5v5)
- Soporte para múltiples formatos (Regular season, Playoffs)
- Panel de control para organizadores

**Estadísticas en Tiempo Real**
- Tablero con cronómetro para registrar cuartos/períodos
- Captura instantánea de estadísticas durante los partidos
- Cálculo automático de PPG, RPG, APG por jugador

**Interfaz de Usuario**
- Diseño retro/neon moderno y responsive
- Vistas de: Inicio, Ligas, Franquicias, Estadísticas
- Tableros para jugadores, torneos y resultados

## 💻 Stack Tecnológico

**Backend:** Node.js + Express 5  
**Base de Datos:** PostgreSQL (Prisma ORM)  
**Frontend:** Vistas server-side con EJS + JS vanilla (sin build ni framework)  
**Autenticación:** JWT en cookie HTTP-only  
**Middleware:** express.json, cookie-parser, multer (subida de imágenes), helmet, express-rate-limit

## 🔐 Seguridad

- Autenticación JWT (cookie HTTP-only) + contraseñas con bcrypt
- Headers de seguridad HTTP vía helmet
- Rate limiting en la API, más estricto en login/registro
- Validación de datos en servidor

## 🚀 Cómo correrlo localmente

1. `npm install`
2. Copiar `.env.example` a `.env` y completar `DATABASE_URL` (Postgres) y `JWT_SECRET`
3. `npx prisma migrate dev` (aplica el schema a tu base)
4. `npm start`

La app queda en `http://localhost:3000`.