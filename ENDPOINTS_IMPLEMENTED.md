# Endpoints Implementados - Sistema de Inscripción de Equipos

## Resumen de Implementación

Se han implementado **3 endpoints interconectados** que permiten:
- **Equipos globales** creados por capitanes
- **Visibilidad segregada**: cada equipado es visible SOLO en torneos donde está inscrito
- **Segregación de datos**: cada organizador ve SOLO sus equipos
- **Flexibilidad**: un equipo puede estar en múltiples torneos

---

## ENDPOINT A: Inscribir Equipo en Torneo

### Ruta
```
POST /api/tournaments/:tournamentId/enroll
```

### Autenticación
- **Requerida**: Bearer token (capitán del equipo)

### Body (JSON)
```json
{
  "teamId": "uuid-del-equipo"
}
```

### Validaciones
✅ Usuario es capitán del equipo
✅ Equipo existe
✅ Equipo tiene ≥3 jugadores
✅ Torneo existe
✅ Torneo no está lleno (currentEnrollments < maxTeams)
✅ Equipo NO está ya inscrito en este torneo

### Respuesta Exitosa (201)
```json
{
  "enrollmentId": "uuid-enrollment",
  "status": "APPROVED",
  "teamId": "uuid-team",
  "tournamentId": "uuid-tournament",
  "message": "Equipo inscrito exitosamente en el torneo"
}
```

### Códigos de Error
- **400**: Equipo tiene <3 jugadores o torneo lleno
- **403**: No eres el capitán del equipo
- **404**: Equipo o torneo no encontrado
- **409**: Equipo ya está inscrito en este torneo

### Ejemplo cURL
```bash
curl -X POST http://localhost:3000/api/tournaments/liga-hermandad-uuid/enroll \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"teamId": "peacemakers-uuid"}'
```

---

## ENDPOINT B: Ver Equipos de un Torneo (SEGREGADO)

### Ruta
```
GET /api/tournaments/:tournamentId/teams
```

### Autenticación
- **Requerida**: Bearer token (solo organizador del torneo)

### Validaciones
✅ Usuario es el organizador del torneo
✅ Devuelve SOLO equipos inscritos en ESTE torneo
✅ Cada organizador ve solo SUS equipos (segregación)

### Respuesta Exitosa (200)
```json
{
  "tournament": {
    "id": "liga-hermandad-uuid",
    "name": "Liga Hermandad",
    "category": "5x5",
    "venue": "Cancha Central",
    "maxTeams": 16,
    "currentTeams": 2,
    "spotsAvailable": 14,
    "startDate": "2026-08-01T00:00:00Z"
  },
  "teams": [
    {
      "enrollmentId": "enrollment-uuid-1",
      "teamId": "peacemakers-uuid",
      "teamName": "Los Peacemakers",
      "logoUrl": "https://example.com/logo.png",
      "captain": {
        "id": "luis-uuid",
        "firstName": "Luis",
        "lastName": "García",
        "email": "luis@example.com"
      },
      "playerCount": 5,
      "status": "APPROVED",
      "amountPaid": 150000,
      "enrollmentDate": "2026-07-14T10:30:00Z"
    },
    {
      "enrollmentId": "enrollment-uuid-2",
      "teamId": "titans-uuid",
      "teamName": "Los Titanes",
      "logoUrl": "https://example.com/titans.png",
      "captain": {
        "id": "carlos-uuid",
        "firstName": "Carlos",
        "lastName": "López",
        "email": "carlos@example.com"
      },
      "playerCount": 7,
      "status": "APPROVED",
      "amountPaid": 200000,
      "enrollmentDate": "2026-07-14T11:15:00Z"
    }
  ]
}
```

### Códigos de Error
- **403**: No eres el organizador de este torneo
- **404**: Torneo no encontrado

### Ejemplo cURL
```bash
curl -X GET http://localhost:3000/api/tournaments/liga-hermandad-uuid/teams \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Comportamiento de Segregación
```
Organizador Juan (juan-uuid):
  GET /api/tournaments/liga-hermandad-uuid/teams
  → VE: Los Peacemakers, Los Titanes (equipos de SU torneo)
  
Organizador Carlos (carlos-uuid):
  GET /api/tournaments/liga-sanjuanero-uuid/teams
  → VE: Los Peacemakers (mismo equipo, DIFERENTE torneo)
  
Organizador Juan intenta ver Liga San Juanero:
  GET /api/tournaments/liga-sanjuanero-uuid/teams
  → 403 Forbidden (no eres organizador de este torneo)
```

---

## ENDPOINT C: Listar Todos los Torneos (Para Capitán buscar)

### Ruta
```
GET /api/tournaments
```

### Autenticación
- **Opcional**: Sin token devuelve TODOS los torneos públicos
- **Con token ORGANIZER/ADMIN**: Devuelve solo los torneos del usuario

### Respuesta Exitosa (200)
```json
[
  {
    "id": "liga-hermandad-uuid",
    "name": "Liga Hermandad",
    "category": "5x5",
    "venue": "Cancha Central Norte",
    "maxTeams": 16,
    "startDate": "2026-08-01T00:00:00Z",
    "organizerId": "juan-uuid",
    "organizer": {
      "id": "juan-uuid",
      "firstName": "Juan",
      "lastName": "González",
      "email": "juan@example.com"
    },
    "createdAt": "2026-07-10T09:00:00Z"
  },
  {
    "id": "liga-sanjuanero-uuid",
    "name": "Liga San Juanero",
    "category": "3x3",
    "venue": "Cancha Callejera",
    "maxTeams": 12,
    "startDate": "2026-08-15T00:00:00Z",
    "organizerId": "carlos-uuid",
    "organizer": {
      "id": "carlos-uuid",
      "firstName": "Carlos",
      "lastName": "López",
      "email": "carlos@example.com"
    },
    "createdAt": "2026-07-12T14:30:00Z"
  }
]
```

### Ejemplo cURL
```bash
# Sin autenticación (capitán ve todos los torneos)
curl -X GET http://localhost:3000/api/tournaments

# Con autenticación de ORGANIZER (ve solo los suyos)
curl -X GET http://localhost:3000/api/tournaments \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Flujo Completo de Uso

### 1. Organizador Juan crea "Liga Hermandad"
```bash
POST /api/tournaments
{
  "name": "Liga Hermandad",
  "category": "5x5",
  "venue": "Cancha Central",
  "maxTeams": 16,
  "startDate": "2026-08-01",
  "inscriptionFee": 0
}
→ tournamentId = "liga-hermandad-uuid"
→ organizerId = "juan-uuid"
```

### 2. Organizador Carlos crea "Liga San Juanero"
```bash
POST /api/tournaments
{
  "name": "Liga San Juanero",
  "category": "3x3",
  "venue": "Cancha Callejera",
  "maxTeams": 12,
  "startDate": "2026-08-15",
  "inscriptionFee": 50000
}
→ tournamentId = "liga-sanjuanero-uuid"
→ organizerId = "carlos-uuid"
```

### 3. Capitán Luis busca torneos disponibles
```bash
GET /api/tournaments
→ Ve: Liga Hermandad (Org: Juan), Liga San Juanero (Org: Carlos)
```

### 4. Capitán Luis crea equipo "Los Peacemakers"
```bash
POST /api/teams
{
  "name": "Los Peacemakers",
  "logoUrl": "https://example.com/logo.png"
}
→ teamId = "peacemakers-uuid"
→ captainId = "luis-uuid"
```

### 5. Capitán Luis agrega 5 jugadores
```bash
POST /api/teams/peacemakers-uuid/players (x5)
{
  "name": "Jugador 1",
  "jerseyNumber": 1,
  "position": "PG"
}
... (repite para 5 jugadores)
```

### 6. Capitán Luis se inscribe en Liga Hermandad
```bash
POST /api/tournaments/liga-hermandad-uuid/enroll
Body: { "teamId": "peacemakers-uuid" }
→ Crea TournamentEnrollment
→ Equipo ahora VISIBLE SOLO en Liga Hermandad
```

### 7. Capitán Luis TAMBIÉN se inscribe en Liga San Juanero
```bash
POST /api/tournaments/liga-sanjuanero-uuid/enroll
Body: { "teamId": "peacemakers-uuid" }
→ Crea otro TournamentEnrollment
→ Mismo equipo, diferente torneo
```

### 8. Organizador Juan ve sus equipos
```bash
GET /api/tournaments/liga-hermandad-uuid/teams
Auth: Bearer juan-token
→ VE: Los Peacemakers (único inscrito en su torneo)
```

### 9. Organizador Carlos ve sus equipos
```bash
GET /api/tournaments/liga-sanjuanero-uuid/teams
Auth: Bearer carlos-token
→ VE: Los Peacemakers (único inscrito en su torneo)
```

### 10. Organizador Juan intenta ver equipos de Liga San Juanero
```bash
GET /api/tournaments/liga-sanjuanero-uuid/teams
Auth: Bearer juan-token
→ 403 Forbidden (no eres organizador de este torneo)
```

---

## Validaciones Implementadas

### ENDPOINT A (POST /enroll)
- ✅ Usuario es capitán del equipo (403 si no)
- ✅ Equipo tiene ≥3 jugadores (400 si no)
- ✅ Equipo existe (404 si no)
- ✅ Torneo existe (404 si no)
- ✅ Torneo no está lleno (400 si está lleno)
- ✅ Equipo NO está ya inscrito (409 si está inscrito)

### ENDPOINT B (GET /teams)
- ✅ Usuario es organizador del torneo (403 si no)
- ✅ Devuelve SOLO equipos de ESTE torneo (segregación)
- ✅ Incluye contador de equipos inscritos y disponibles
- ✅ Información completa de capitán y jugadores

### ENDPOINT C (GET /tournaments)
- ✅ Sin autenticación: devuelve TODOS los torneos
- ✅ Con autenticación ORGANIZER: devuelve solo los suyos
- ✅ Incluye información del organizador
- ✅ Ordenados por fecha de creación

---

## Arquitectura Clave

### Tabla Pivote: TournamentEnrollment
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
  
  @@unique([tournamentId, teamId])  // Un equipo por torneo
}
```

### Ventajas de esta Arquitectura
1. **Equipos Globales**: Un equipo existe una sola vez en la BD
2. **Invisibilidad hasta Inscripción**: Sin TournamentEnrollment, no es visible
3. **Segregación Automática**: Solo VER equipos donde hay TournamentEnrollment
4. **Flexibilidad**: Un equipo en múltiples torneos sin confusión
5. **Integridad**: Constraint única previene duplicados

---

## Testing de los Endpoints

### Test 1: Inscribir equipo SIN 3 jugadores
```bash
curl -X POST http://localhost:3000/api/tournaments/liga-hermandad-uuid/enroll \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"teamId": "team-con-1-jugador"}'
→ 400: El equipo debe tener al menos 3 jugadores
```

### Test 2: Inscribir equipo dos veces
```bash
# Primera inscripción
curl -X POST http://localhost:3000/api/tournaments/liga-hermandad-uuid/enroll \
  -H "Authorization: Bearer token" \
  -d '{"teamId": "peacemakers-uuid"}'
→ 201: APPROVED

# Segunda inscripción
curl -X POST http://localhost:3000/api/tournaments/liga-hermandad-uuid/enroll \
  -H "Authorization: Bearer token" \
  -d '{"teamId": "peacemakers-uuid"}'
→ 409: Este equipo ya está inscrito en el torneo
```

### Test 3: Ver equipos sin ser organizador
```bash
curl -X GET http://localhost:3000/api/tournaments/liga-hermandad-uuid/teams \
  -H "Authorization: Bearer otro-organizador-token"
→ 403: Acceso denegado
```

### Test 4: Listar torneos como capitán
```bash
curl -X GET http://localhost:3000/api/tournaments
→ 200: Lista TODOS los torneos públicamente
```
