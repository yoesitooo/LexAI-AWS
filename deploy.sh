#!/usr/bin/env bash
# =============================================================================
# deploy.sh — LexAI MVP
# Script de despliegue rápido para EC2 t3.small con Docker Compose.
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requisitos:
#   - Git instalado y el repo clonado
#   - Docker y Docker Compose instalados
#   - Archivo .env configurado en la raíz del proyecto
# =============================================================================

set -euo pipefail

echo "=== LexAI Deploy ==="

# 1. Obtener últimos cambios del repositorio
echo "[1/3] Pulling latest code..."
git pull

# 2. Construir imágenes y levantar servicios en modo detached
echo "[2/3] Building and starting services..."
docker compose up -d --build

# 3. Ejecutar migraciones de Prisma (opcional, si aplica)
echo "[3/3] Running database migrations..."
docker compose exec web npx prisma migrate deploy || echo "⚠ Migrations skipped (service may still be starting)"

echo "=== Deploy complete ==="
