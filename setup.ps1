# MemAide Setup Script for Windows
# Run this script once after cloning the repository

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
Write-Host "MemAide Setup Script" -ForegroundColor Cyan
Write-Host "Script directory: $scriptDir" -ForegroundColor Gray

# Check Node.js
Write-Host "`nChecking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check npm
Write-Host "`nChecking npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check Docker
Write-Host "`nChecking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "Docker version: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

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

# Create server/.env if it doesn't exist
$serverEnv = Join-Path $scriptDir "server\.env"
$serverEnvExample = Join-Path $scriptDir "server\.env.example"
if (-not (Test-Path $serverEnv)) {
    Write-Host "`nCreating server/.env from server/.env.example..." -ForegroundColor Yellow
    Copy-Item $serverEnvExample $serverEnv
    Write-Host "Created server/.env" -ForegroundColor Green
} else {
    Write-Host "`nserver/.env already exists, skipping creation" -ForegroundColor Gray
}

# Create client/.env if it doesn't exist
$clientEnv = Join-Path $scriptDir "client\.env"
$clientEnvExample = Join-Path $scriptDir "client\.env.example"
if (-not (Test-Path $clientEnv)) {
    Write-Host "`nCreating client/.env from client/.env.example..." -ForegroundColor Yellow
    Copy-Item $clientEnvExample $clientEnv
    Write-Host "Created client/.env" -ForegroundColor Green
} else {
    Write-Host "`nclient/.env already exists, skipping creation" -ForegroundColor Gray
}

# Backend setup
Write-Host "`n=== Backend Setup ===" -ForegroundColor Cyan
$serverDir = Join-Path $scriptDir "server"
Set-Location $serverDir

Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Starting PostgreSQL with Docker Compose..." -ForegroundColor Yellow
docker compose up -d

Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "Running database migrations..." -ForegroundColor Yellow
npx prisma migrate dev

Write-Host "Seeding database..." -ForegroundColor Yellow
npx prisma db seed

Write-Host "Building backend..." -ForegroundColor Yellow
npm run build

# Frontend setup
Write-Host "`n=== Frontend Setup ===" -ForegroundColor Cyan
$clientDir = Join-Path $scriptDir "client"
Set-Location $clientDir

Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Building frontend..." -ForegroundColor Yellow
npm run build

# Return to script directory
Set-Location $scriptDir

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "To start the development servers, run:" -ForegroundColor Cyan
Write-Host "  .\start.ps1" -ForegroundColor White
Write-Host "`nBackend URL: http://localhost:4000" -ForegroundColor Gray
Write-Host "Frontend URL: http://localhost:5273" -ForegroundColor Gray
