# Changelog - Sistema de Inscripción de Equipos

## Fecha: 2026-07-14
## Cambios Realizados: 3 Endpoints Interconectados

### Descripción General
Se implementó un sistema completo de inscripción de equipos en torneos con segregación de datos, permitiendo que:
- Equipos sean globales (creados una sola vez por capitán)
- Equipos sean visibles SOLO en torneos donde están inscritos
- Cada organizador vea SOLO sus equipos
- Un equipo pueda estar en múltiples torneos simultáneamente

---

## Cambios en `index.js`

### 1. ENDPOINT C - GET /api/tournaments (MODIFICADO)
**Líneas: 99-137**

**Cambio:** Modificar el comportamiento para devolver TODOS los torneos públicamente cuando no hay autenticación

**Antes:**
```javascript
app.get('/api/tournaments', optionalAuthenticateToken, async (req, res) => {
    let whereClause = {};
    if (req.user) {
        whereClause = { organizerId: req.user.id };
    }
    // devolvía solo los del usuario si estaba autenticado
});
```

**Después:**
```javascript
app.get('/api/tournaments', optionalAuthenticateToken, async (req, res) => {
    let whereClause = {};
    
    if (req.user) {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (user && (user.role === 'ORGANIZER' || user.role === 'ADMIN')) {
            whereClause = { organizerId: req.user.id };
        }
    }
    // ORGANIZER/ADMIN ven solo los suyos
    // PLAYER o sin auth ven TODOS
});
```

**Beneficio:** Capitanes pueden buscar torneos disponibles sin autenticación

---

### 2. ENDPOINT A - POST /api/tournaments/:id/enroll (MEJORADO)
**Líneas: 464-515**

**Cambio:** Agregar validación de mínimo 3 jugadores y mejorar documentación

**Nuevas Validaciones:**
```javascript
// Validación de jugadores
const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { players: true } } }
});

if (team._count.players < 3) {
    return res.status(400).json({
        error: `El equipo debe tener al menos 3 jugadores. Actualmente tiene ${team._count.players}.`
    });
}
```

**Mejora en Respuesta:**
```javascript
res.status(201).json({
    enrollmentId: enrollment.id,
    status: 'APPROVED',
    teamId,
    tournamentId,
    message: 'Equipo inscrito exitosamente en el torneo'
});
```

**Beneficio:** Previene inscripción de equipos incompletos

---

### 3. ENDPOINT B - GET /api/tournaments/:id/teams (MEJORADO)
**Líneas: 548-605**

**Cambio:** Mejorar respuesta con más información y mejor estructura

**Nuevos Datos Incluidos:**
```javascript
{
    "tournament": {
        "id": "...",
        "name": "...",
        "maxTeams": 16,
        "currentTeams": 5,      // ← NUEVO
        "spotsAvailable": 11     // ← NUEVO
    },
    "teams": [
        {
            "enrollmentId": "...",      // ← NUEVO
            "teamId": "...",
            "teamName": "...",
            "captain": { ... },
            "playerCount": 5,
            "status": "APPROVED",
            "amountPaid": 150000,       // ← NUEVO
            "enrollmentDate": "..."     // ← NUEVO
        }
    ]
}
```

**Beneficio:** Organizador tiene visibilidad completa de sus inscripciones

---

## Archivos Nuevos Creados

### 1. `ENDPOINTS_IMPLEMENTED.md`
- Documentación completa de los 3 endpoints
- Especificación detallada de validaciones
- Ejemplos de flujo completo
- Códigos de error y respuestas

### 2. `QUICK_REFERENCE.md`
- Guía rápida de consulta
- Tabla de validaciones
- Ejemplos cURL
- Troubleshooting

### 3. `test-endpoints.sh`
- Script bash para probar los endpoints
- 6 casos de prueba diferentes
- Valida éxito y errores esperados

### 4. `CHANGELOG_ENDPOINTS.md` (este archivo)
- Registro detallado de cambios
- Antes/después de modificaciones
- Beneficios de cada cambio

---

## Validaciones Implementadas

### ENDPOINT A (POST /enroll)
- ✅ Usuario es capitán del equipo (403)
- ✅ Equipo tiene ≥3 jugadores (400)
- ✅ Equipo existe (404)
- ✅ Torneo existe (404)
- ✅ Torneo no está lleno (400)
- ✅ Equipo NO está ya inscrito (409)

### ENDPOINT B (GET /teams)
- ✅ Usuario es organizador del torneo (403)
- ✅ Torneo existe (404)
- ✅ Devuelve SOLO equipos de ESTE torneo
- ✅ Seguridad: cada org ve solo sus datos

### ENDPOINT C (GET /tournaments)
- ✅ Sin auth: TODOS los torneos públicos
- ✅ Con auth ORGANIZER: solo los suyos
- ✅ Incluye info del organizador
- ✅ Ordenados por creación

---

## Pruebas Recomendadas

### Test 1: Inscribir equipo con éxito
```bash
POST /api/tournaments/liga-uuid/enroll
{"teamId": "team-uuid"}
→ Esperado: 201 APPROVED
```

### Test 2: Rechazar equipo con <3 jugadores
```bash
POST /api/tournaments/liga-uuid/enroll
{"teamId": "team-con-2-players"}
→ Esperado: 400 "debe tener al menos 3"
```

### Test 3: Rechazar inscripción duplicada
```bash
POST /api/tournaments/liga-uuid/enroll (2x)
→ Primer intento: 201
→ Segundo intento: 409 "ya está inscrito"
```

### Test 4: Ver equipos como organizador
```bash
GET /api/tournaments/liga-uuid/teams
→ Esperado: 200 + equipos inscritos
```

### Test 5: Rechazar acceso no autorizado
```bash
GET /api/tournaments/liga-uuid/teams (otro org)
→ Esperado: 403 "Acceso denegado"
```

### Test 6: Listar torneos públicamente
```bash
GET /api/tournaments
→ Esperado: 200 + TODOS los torneos
```

---

## Modelo de Datos - TournamentEnrollment

```prisma
model TournamentEnrollment {
  id           String     @id @default(uuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  teamId       String
  team         Team       @relation(fields: [teamId], references: [id])
  amountPaid   Int        @default(0)
  status       String     @default("APPROVED")
  createdAt    DateTime   @default(now())
  
  @@unique([tournamentId, teamId])
}
```

**Clave:** El constraint único `@@unique([tournamentId, teamId])` previene que un equipo se inscriba dos veces en el mismo torneo.

---

## Flujo de Arquitectura

```
User (Capitán)
    ↓
    ├─ crea → Team (Global)
    │            ├─ jugadores (Players)
    │            └─ enrollments (TournamentEnrollment[])
    │
    └─ inscribe → Tournament (de Organizador)
                    ├─ enrollments (TournamentEnrollment[])
                    └─ VIA → Team (a través de TournamentEnrollment)

TournamentEnrollment es la CLAVE:
- Vincula Team ↔ Tournament
- Permite que Team sea en múltiples Tournament
- Controla visibilidad y segregación
```

---

## Seguridad

### Autenticación
- ✅ Tokens JWT en headers `Authorization: Bearer`
- ✅ Validación de rol (PLAYER, ORGANIZER, ADMIN)

### Validaciones de Negocio
- ✅ Solo capitán puede inscribir su equipo
- ✅ Solo organizador ve sus equipos
- ✅ Equipos con mínimo 3 jugadores
- ✅ Torneos no se sobrecapacitan

### Integridad de Datos
- ✅ Constraint única previene duplicados en BD
- ✅ Transacciones para operaciones complejas
- ✅ Validación de existencia antes de operaciones

---

## Performance

### Optimizaciones
- ✅ Include de relationships para evitar N+1 queries
- ✅ Count de jugadores sin cargar array completo
- ✅ Índice automático en campos de relaciones

### Escalabilidad
- ✅ Un equipo puede estar en ilimitados torneos
- ✅ Un torneo puede tener ilimitados equipos (maxTeams)
- ✅ Sin queries recursivas o costosas

---

## Retrocompatibilidad

✅ **No rompe endpoints existentes**
- POST /api/tournaments (crear) - sin cambios
- PUT /api/tournaments (editar) - sin cambios
- DELETE /api/tournaments (eliminar) - sin cambios
- POST /api/teams (crear) - sin cambios
- GET /api/teams (todos públicamente) - sin cambios

---

## Documentación Generada

| Archivo | Propósito |
|---------|-----------|
| `ENDPOINTS_IMPLEMENTED.md` | Especificación completa |
| `QUICK_REFERENCE.md` | Guía rápida de consulta |
| `test-endpoints.sh` | Script de pruebas |
| `CHANGELOG_ENDPOINTS.md` | Este archivo |

---

## Próximas Mejoras Sugeridas

- [ ] Agregar paginación en GET /tournaments
- [ ] Filtro por categoría: `GET /tournaments?category=5x5`
- [ ] Endpoint para obtener enrollments de un capitán
- [ ] Sistema de validación y cambio de estado de pago
- [ ] Webhooks cuando equipo se inscribe
- [ ] DELETE /enrollments/:id para cancelar inscripción
- [ ] Endpoint para ver disponibilidad en tiempo real

---

## Resumen de Cambios

| Archivo | Tipo | Líneas | Descripción |
|---------|------|--------|-------------|
| index.js | Modificado | 99-137 | ENDPOINT C: GET /tournaments mejorado |
| index.js | Modificado | 464-515 | ENDPOINT A: POST /enroll validación +3 jugadores |
| index.js | Modificado | 548-605 | ENDPOINT B: GET /teams mejorada respuesta |
| ENDPOINTS_IMPLEMENTED.md | Nuevo | - | Documentación completa |
| QUICK_REFERENCE.md | Nuevo | - | Guía rápida |
| test-endpoints.sh | Nuevo | - | Script de pruebas |

---

## Verificación

Para verificar que todo está funcionando:

```bash
# 1. Iniciar servidor
npm start

# 2. Probar endpoint C (ver torneos)
curl http://localhost:3000/api/tournaments

# 3. Probar endpoint A (inscribir - necesita token y equipo con ≥3 jugadores)
curl -X POST http://localhost:3000/api/tournaments/uuid/enroll \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"teamId": "uuid"}'

# 4. Probar endpoint B (ver equipos - necesita token de organizador)
curl http://localhost:3000/api/tournaments/uuid/teams \
  -H "Authorization: Bearer token"
```

---

## Conclusión

Los 3 endpoints implementados proporcionan una solución completa y segura para:
✅ Inscripción de equipos en múltiples torneos  
✅ Segregación automática de datos  
✅ Validación de integridad  
✅ Escalabilidad y performance  

La arquitectura con TournamentEnrollment como tabla pivote es robusta, mantenible y lista para producción.
