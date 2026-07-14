# Referencia Rápida - 3 Endpoints Implementados

## 📋 Resumen Ejecutivo

Los 3 endpoints implementados resuelven el problema de **segregación de datos**:
- ✅ Equipos son **globales** (creados por capitán una sola vez)
- ✅ Equipos visibles **SOLO** en torneos donde están inscritos
- ✅ Cada organizador **SOLO VE** sus equipos
- ✅ Un equipo puede estar en **múltiples torneos** simultáneamente

---

## 🔑 Los 3 Endpoints

### 1️⃣ ENDPOINT A - Inscribir Equipo
```
POST /api/tournaments/:tournamentId/enroll
Authorization: Bearer {captainToken}
Body: { "teamId": "uuid" }
```
**¿Quién?** Capitán del equipo  
**¿Para qué?** Inscribir su equipo en un torneo  
**Validaciones:**
- ✓ Es capitán del equipo
- ✓ Equipo tiene ≥3 jugadores
- ✓ Torneo existe y no está lleno
- ✓ Equipo no está ya inscrito

**Respuesta exitosa:**
```json
{
  "enrollmentId": "uuid",
  "status": "APPROVED",
  "teamId": "uuid",
  "tournamentId": "uuid"
}
```

---

### 2️⃣ ENDPOINT B - Ver Equipos del Torneo
```
GET /api/tournaments/:tournamentId/teams
Authorization: Bearer {organizerToken}
```
**¿Quién?** Organizador del torneo  
**¿Para qué?** Ver los equipos inscritos en su torneo  
**Validaciones:**
- ✓ Usuario es organizador del torneo

**Respuesta exitosa:**
```json
{
  "tournament": {
    "id": "uuid",
    "name": "Liga Hermandad",
    "maxTeams": 16,
    "currentTeams": 5,
    "spotsAvailable": 11
  },
  "teams": [
    {
      "teamId": "uuid",
      "teamName": "Los Peacemakers",
      "captain": { "firstName": "Luis", "lastName": "García" },
      "playerCount": 5,
      "status": "APPROVED"
    }
  ]
}
```

---

### 3️⃣ ENDPOINT C - Listar Todos los Torneos
```
GET /api/tournaments
```
**¿Quién?** Cualquiera (capitanes sin auth)  
**¿Para qué?** Encontrar torneos disponibles para inscribirse  
**Comportamiento:**
- Sin token: devuelve TODOS los torneos públicos
- Con token ORGANIZER: devuelve solo los suyos

**Respuesta exitosa:**
```json
[
  {
    "id": "uuid",
    "name": "Liga Hermandad",
    "category": "5x5",
    "venue": "Cancha Central",
    "maxTeams": 16,
    "organizerId": "uuid",
    "organizer": {
      "firstName": "Juan",
      "lastName": "González"
    }
  }
]
```

---

## 🔄 Flujo Típico de Uso

```
1. Organizador Juan → POST /api/tournaments → Crea "Liga Hermandad"
                     ↓
2. Capitán Luis → GET /api/tournaments → Ve "Liga Hermandad" disponible
                  ↓
3. Capitán Luis → POST /api/teams → Crea "Los Peacemakers"
                  ↓
4. Capitán Luis → POST /api/teams/:id/players (x5) → Agrega jugadores
                  ↓
5. Capitán Luis → POST /api/tournaments/.../enroll → Inscribe equipo
                  ↓
6. Organizador Juan → GET /api/tournaments/.../teams → VE "Los Peacemakers"
```

---

## 🛡️ Validaciones Clave

| Validación | Endpoint | Error | Código |
|-----------|----------|-------|--------|
| Usuario es capitán | A | No eres el capitán | 403 |
| Equipo tiene ≥3 jugadores | A | Equipo debe tener ≥3 | 400 |
| Torneo existe | A | Torneo no encontrado | 404 |
| Torneo no está lleno | A | Torneo lleno | 400 |
| Equipo no está inscrito | A | Ya inscrito | 409 |
| Usuario es organizador | B | No eres organizador | 403 |

---

## 🎯 Segregación de Datos

```
Base de Datos:
- User: Juan (organizador), Carlos (organizador), Luis (capitán)
- Tournament: Liga Hermandad (org=Juan), Liga San Juanero (org=Carlos)
- Team: Los Peacemakers (captain=Luis)
- TournamentEnrollment: 
  * (Liga Hermandad, Los Peacemakers) ← visible para Juan
  * (Liga San Juanero, Los Peacemakers) ← visible para Carlos

Resultado:
- Juan ve: Los Peacemakers (en su torneo)
- Carlos ve: Los Peacemakers (en su torneo)
- Luis ve: Sus datos + puede estar en múltiples torneos
- Otro Organizador: NO ve nada (no es su torneo)
```

---

## 💻 Ejemplos cURL

### Buscar torneos (Capitán)
```bash
curl http://localhost:3000/api/tournaments
```

### Inscribir equipo (Capitán)
```bash
curl -X POST http://localhost:3000/api/tournaments/liga-uuid/enroll \
  -H "Authorization: Bearer token-capitán" \
  -H "Content-Type: application/json" \
  -d '{"teamId": "team-uuid"}'
```

### Ver equipos (Organizador)
```bash
curl http://localhost:3000/api/tournaments/liga-uuid/teams \
  -H "Authorization: Bearer token-organizador"
```

---

## 📊 Tabla TournamentEnrollment

```prisma
model TournamentEnrollment {
  id           String     @id @default(uuid())
  tournamentId String     // ← Qué torneo
  teamId       String     // ← Qué equipo
  amountPaid   Int        // ← Cuánto pagó
  status       String     // ← APPROVED, PENDING, etc
  createdAt    DateTime   // ← Fecha inscripción
  
  @@unique([tournamentId, teamId])  // ← Previene duplicados
}
```

---

## ✨ Ventajas de esta Arquitectura

| Ventaja | Cómo se logra |
|---------|--------------|
| Equipos globales | Un solo registro en `Team` |
| Visibilidad segregada | Filtrar por `TournamentEnrollment` |
| Sin duplicados | Constraint única en BD |
| Múltiples torneos | Crear varios `TournamentEnrollment` |
| Auditoría de pagos | Campo `amountPaid` en enrollment |

---

## 🧪 Pruebas Recomendadas

```bash
# 1. Listar todos los torneos
GET /api/tournaments

# 2. Inscribir equipo correctamente
POST /api/tournaments/uuid/enroll
{"teamId": "uuid"}
→ Esperado: 201 APPROVED

# 3. Intentar inscribir sin 3 jugadores
POST /api/tournaments/uuid/enroll
{"teamId": "team-con-2-players"}
→ Esperado: 400 "debe tener al menos 3"

# 4. Intentar inscribir dos veces
POST /api/tournaments/uuid/enroll (2x)
→ Primer intento: 201
→ Segundo intento: 409 "ya está inscrito"

# 5. Ver equipos como organizador
GET /api/tournaments/uuid/teams
→ Esperado: 200 + array de equipos

# 6. Ver equipos sin ser organizador
GET /api/tournaments/uuid/teams (otro token)
→ Esperado: 403 "Acceso denegado"
```

---

## 🚀 Próximos Pasos Opcionales

- [ ] Agregar paginación en `GET /tournaments`
- [ ] Filtro por categoría: `GET /tournaments?category=5x5`
- [ ] Endpoint para listar enrollments de un capitán
- [ ] Webhook cuando equipo se inscribe
- [ ] Sistema de validación de pagos
- [ ] Cancelar inscripción (DELETE /enrollments/:id)

---

## 📝 Notas Importantes

1. **Token debe estar en header** `Authorization: Bearer {token}`
2. **TournamentEnrollment es la clave** - sin ella, el equipo no existe en el torneo
3. **Cada organizador ve SOLO sus torneos** - segregación automática
4. **Un equipo puede estar en múltiples torneos** - sin conflictos
5. **Validación de ≥3 jugadores** - previene equipos incompletos

---

## 📞 Troubleshooting

**"Equipo no encontrado"**
- ✓ Verificar que el `teamId` existe en BD
- ✓ Verificar que el usuario es el capitán

**"Solo el organizador puede ver"**
- ✓ Verificar que el token es del organizador del torneo
- ✓ Verificar que `organizerId` coincide

**"Este equipo ya está inscrito"**
- ✓ El equipo ya tiene un `TournamentEnrollment` en este torneo
- ✓ Usar endpoint para actualizar (si existe) o cancelar e reinscribir

**"Torneo lleno"**
- ✓ Contar: `currentTeams >= maxTeams`
- ✓ Contactar al organizador para aumentar cupo

---

## 🔐 Seguridad

- ✅ Validación de capitán antes de inscribir
- ✅ Validación de organizador antes de ver equipos
- ✅ Constraint única en BD previene duplicados
- ✅ Tokens JWT en autenticación
- ✅ Segregación automática de datos
