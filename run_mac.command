#!/bin/bash
# สคริปต์ช่วย Build และรันระบบ SPU SKYE บน macOS
set -e
cd "$(dirname "$0")"

echo "[SPU SKYE] Checking Docker..."
if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker Desktop is not running. Please open Docker Desktop first."
  exit 1
fi

echo "[SPU SKYE] Building and starting containers..."
docker compose up --build -d

echo "[SPU SKYE] Ready! Opening http://localhost:3000 ..."
open "http://localhost:3000"