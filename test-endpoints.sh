#!/bin/bash

# Script para probar los 3 endpoints implementados
# Asegúrate de tener el servidor corriendo: npm start

BASE_URL="http://localhost:3000"

echo "================================================"
echo "PRUEBAS DE ENDPOINTS - Sistema de Inscripción"
echo "================================================"

# Variables de prueba (reemplaza con IDs reales de tu BD)
ORGANIZER_TOKEN="tu-token-organizador"
CAPTAIN_TOKEN="tu-token-capitán"
TOURNAMENT_ID="liga-hermandad-uuid"
TEAM_ID="peacemakers-uuid"

# ===== ENDPOINT C: Listar todos los torneos =====
echo ""
echo "=== TEST 1: GET /api/tournaments ==="
echo "Capitán busca TODOS los torneos disponibles..."
curl -X GET "$BASE_URL/api/tournaments" \
  -H "Authorization: Bearer $CAPTAIN_TOKEN" \
  -H "Content-Type: application/json" \
  -s | jq '.'

# ===== ENDPOINT A: Inscribir equipo =====
echo ""
echo "=== TEST 2: POST /api/tournaments/:id/enroll ==="
echo "Capitán inscribe su equipo (Los Peacemakers) en Liga Hermandad..."
curl -X POST "$BASE_URL/api/tournaments/$TOURNAMENT_ID/enroll" \
  -H "Authorization: Bearer $CAPTAIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teamId\": \"$TEAM_ID\"}" \
  -s | jq '.'

# ===== ENDPOINT A: Intentar inscribir sin 3 jugadores =====
echo ""
echo "=== TEST 3: POST /enroll - Sin 3 jugadores (error esperado) ==="
echo "Intentando inscribir equipo con <3 jugadores..."
curl -X POST "$BASE_URL/api/tournaments/$TOURNAMENT_ID/enroll" \
  -H "Authorization: Bearer $CAPTAIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teamId\": \"team-con-2-jugadores\"}" \
  -s | jq '.'

# ===== ENDPOINT B: Ver equipos del torneo =====
echo ""
echo "=== TEST 4: GET /api/tournaments/:id/teams ==="
echo "Organizador Juan ve sus equipos en Liga Hermandad..."
curl -X GET "$BASE_URL/api/tournaments/$TOURNAMENT_ID/teams" \
  -H "Authorization: Bearer $ORGANIZER_TOKEN" \
  -H "Content-Type: application/json" \
  -s | jq '.'

# ===== ENDPOINT B: Intenta ver sin ser organizador =====
echo ""
echo "=== TEST 5: GET /teams - Sin permisos (error esperado) ==="
echo "Otro organizador intenta ver equipos de Liga Hermandad..."
curl -X GET "$BASE_URL/api/tournaments/$TOURNAMENT_ID/teams" \
  -H "Authorization: Bearer otro-organizador-token" \
  -H "Content-Type: application/json" \
  -s | jq '.'

# ===== ENDPOINT A: Inscribir el mismo equipo dos veces =====
echo ""
echo "=== TEST 6: POST /enroll - Duplicado (error esperado) ==="
echo "Intentando inscribir el mismo equipo de nuevo..."
curl -X POST "$BASE_URL/api/tournaments/$TOURNAMENT_ID/enroll" \
  -H "Authorization: Bearer $CAPTAIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"teamId\": \"$TEAM_ID\"}" \
  -s | jq '.'

echo ""
echo "================================================"
echo "PRUEBAS COMPLETADAS"
echo "================================================"
