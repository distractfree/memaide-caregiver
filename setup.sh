#!/bin/bash

# MemAide Setup Script for Mac/Linux
# Run this script once after cloning the repository

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "MemAide Setup Script"
echo "Script directory: $SCRIPT_DIR"

# Check node
echo ""
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "Node.js version: $NODE_VERSION"

# Check npm
echo ""
echo "Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo "npm version: $NPM_VERSION"

# Check docker
echo ""
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
fi
DOCKER_VERSION=$(docker --version)
echo "Docker version: $DOCKER_VERSION"

# Check Docker is running
echo ""
echo "Checking if Docker is running..."
if ! docker info &> /dev/null; then
    echo "ERROR: Docker is not running"
    echo "Please open Docker Desktop and run this script again"
    exit 1
fi
echo "Docker is running"

# Create server/.env if it doesn't exist
if [ ! -f "server/.env" ]; then
    echo ""
    echo "Creating server/.env from server/.env.example..."
    cp server/.env.example server/.env
    echo "Created server/.env"
else
    echo ""
    echo "server/.env already exists, skipping creation"
fi

# Create client/.env if it doesn't exist
if [ ! -f "client/.env" ]; then
    echo ""
    echo "Creating client/.env from client/.env.example..."
    cp client/.env.example client/.env
    echo "Created client/.env"
else
    echo ""
    echo "client/.env already exists, skipping creation"
fi

# Backend setup
echo ""
echo "=== Backend Setup ==="
cd server

echo "Installing backend dependencies..."
npm install

echo "Starting PostgreSQL with Docker Compose..."
docker compose up -d

echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "Running database migrations..."
npx prisma migrate dev

echo "Seeding database..."
npx prisma db seed

echo "Building backend..."
npm run build

# Frontend setup
echo ""
echo "=== Frontend Setup ==="
cd ../client

echo "Installing frontend dependencies..."
npm install

echo "Building frontend..."
npm run build

# Return to script directory
cd "$SCRIPT_DIR"

echo ""
echo "=== Setup Complete ==="
echo "To start the development servers, run:"
echo "  ./start.sh"
echo ""
echo "Backend URL: http://localhost:4000"
echo "Frontend URL: http://localhost:5273"
