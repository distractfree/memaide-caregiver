# MemAide Start Script for Windows
# Run this script to start the development servers

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
Write-Host "MemAide Start Script" -ForegroundColor Cyan
Write-Host "Script directory: $scriptDir" -ForegroundColor Gray

# Check Docker is running
Write-Host "`nChecking if Docker is running..." -ForegroundColor Yellow
try {
    docker info > $null 2>&1
    Write-Host "Docker is running" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not running" -ForegroundColor Red
    Write-Host "Please open Docker Desktop and run this script again" -ForegroundColor Yellow
    exit 1
}

# Check if .env files exist
$serverEnv = Join-Path $scriptDir "server\.env"
$clientEnv = Join-Path $scriptDir "client\.env"

if (-not (Test-Path $serverEnv)) {
    Write-Host "`nERROR: server/.env does not exist" -ForegroundColor Red
    Write-Host "Please run .\setup.ps1 first" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $clientEnv)) {
    Write-Host "`nERROR: client/.env does not exist" -ForegroundColor Red
    Write-Host "Please run .\setup.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Check if ports are in use
Write-Host "`nChecking ports..." -ForegroundColor Yellow
$port4000InUse = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
$port5273InUse = Get-NetTCPConnection -LocalPort 5273 -ErrorAction SilentlyContinue

if ($port4000InUse) {
    Write-Host "WARNING: Port 4000 is already in use" -ForegroundColor Yellow
    Write-Host "If the backend fails to start, stop the process using port 4000" -ForegroundColor Gray
}

if ($port5273InUse) {
    Write-Host "WARNING: Port 5273 is already in use" -ForegroundColor Yellow
    Write-Host "If the frontend fails to start, use the port that Vite prints" -ForegroundColor Gray
}

# Start PostgreSQL
Write-Host "`nStarting PostgreSQL with Docker Compose..." -ForegroundColor Yellow
$serverDir = Join-Path $scriptDir "server"
Set-Location $serverDir
docker compose up -d

# Return to script directory
Set-Location $scriptDir

# Start backend and frontend in separate windows
Write-Host "`nStarting development servers..." -ForegroundColor Yellow

$backendScript = {
    param($dir)
    Set-Location $dir
    npm run dev
}

$frontendScript = {
    param($dir)
    Set-Location $dir
    npm run dev
}

try {
    # Start backend in new window
    Write-Host "Starting backend in new window..." -ForegroundColor Gray
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$serverDir'; npm run dev" -PassThru
    
    # Start frontend in new window
    Write-Host "Starting frontend in new window..." -ForegroundColor Gray
    $frontendDir = Join-Path $scriptDir "client"
    $frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev" -PassThru
    
    Write-Host "`n=== Development Servers Started ===" -ForegroundColor Green
    Write-Host "Backend URL: http://localhost:4000" -ForegroundColor Cyan
    Write-Host "Frontend URL: http://localhost:5273 (or the port shown by Vite)" -ForegroundColor Cyan
    Write-Host "`nClose the PowerShell windows to stop the servers" -ForegroundColor Gray
    
} catch {
    Write-Host "`nERROR: Failed to start servers in separate windows" -ForegroundColor Red
    Write-Host "`nPlease start them manually in two separate PowerShell windows:" -ForegroundColor Yellow
    Write-Host "`nBackend:" -ForegroundColor Cyan
    Write-Host "  cd server" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host "`nFrontend:" -ForegroundColor Cyan
    Write-Host "  cd client" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host "`nBackend URL: http://localhost:4000" -ForegroundColor Gray
    Write-Host "Frontend URL: http://localhost:5273 (or the port shown by Vite)" -ForegroundColor Gray
}
