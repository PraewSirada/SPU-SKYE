@echo off
REM สคริปต์ช่วย Build และรันระบบ SPU SKYE บน Windows ด้วยคำสั่งเดียว
cd /d "%~dp0"

echo [SPU SKYE] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running. Please open Docker Desktop and try again.
    pause
    exit /b 1
)

echo [SPU SKYE] Building and starting containers...
docker compose up --build -d
if errorlevel 1 (
    echo [ERROR] Failed to start containers.
    pause
    exit /b 1
)

echo.
echo [SPU SKYE] Ready! Opening http://localhost:3000 ...
start http://localhost:3000
pause

