#!/bin/bash

# MemAide Start Script for Mac/Linux
# Run this script to start the development servers

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "MemAide Start Script"
echo "Script directory: $SCRIPT_DIR"

# Check Docker is running
echo ""
echo "Checking if Docker is running..."
if ! docker info &> /dev/null; then
    echo "ERROR: Docker is not running"
    echo "Please open Docker Desktop and run this script again"
    exit 1
fi
echo "Docker is running"

# Check if .env files exist
if [ ! -f "server/.env" ]; then
    echo ""
    echo "ERROR: server/.env does not exist"
    echo "Please run ./setup.sh first"
    exit 1
fi

if [ ! -f "client/.env" ]; then
    echo ""
    echo "ERROR: client/.env does not exist"
    echo "Please run ./setup.sh first"
    exit 1
fi

# Start PostgreSQL
echo ""
echo "Starting PostgreSQL with Docker Compose..."
cd server
docker compose up -d

# Return to script directory
cd "$SCRIPT_DIR"

# Start backend in background
echo ""
echo "Starting backend in background..."
cd server
npm run dev > /tmp/memaide-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Return to script directory
cd "$SCRIPT_DIR"

# Start frontend in foreground
echo ""
echo "Starting frontend in foreground..."
echo "Press Ctrl+C to stop the frontend"
echo "Backend is running in background (PID: $BACKEND_PID)"
echo "You may need to stop the backend manually if needed"
echo ""
echo "Backend URL: http://localhost:4000"
echo "Frontend URL: http://localhost:5273 (or the port shown by Vite)"
echo ""

cd client
npm run dev

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping backend (PID: $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null || true
    exit 0
}

# Trap Ctrl+C
trap cleanup INT
