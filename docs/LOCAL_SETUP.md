# Local Development Setup

This guide helps teammates set up the MemAide project locally after cloning from GitHub.

## Quick Start

### Windows

Run the setup script once after cloning:
```powershell
.\setup.ps1
```

Then start the development servers:
```powershell
.\start.ps1
```

### Mac/Linux

Make the scripts executable (once):
```bash
chmod +x setup.sh start.sh
```

Run the setup script once after cloning:
```bash
./setup.sh
```

Then start the development servers:
```bash
./start.sh
```

**Important notes:**
- `setup` is for first-time setup (installs dependencies, sets up database, builds projects)
- `start` is for daily running (starts PostgreSQL and development servers)
- Real `.env` files are created locally but ignored by Git
- If Docker is not running, open Docker Desktop first
- If setup fails during Prisma seed because data already exists, you can safely continue with `./start.sh`

## Prerequisites

- Docker Desktop installed and running
- Node.js (v18 or higher recommended)
- npm or yarn

## Backend Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Copy the environment example file:
   - Windows:
     ```bash
     copy .env.example .env
     ```
   - macOS/Linux:
     ```bash
     cp .env.example .env
     ```

3. Start PostgreSQL with Docker Compose:
   ```bash
   docker compose up -d
   ```

4. Install dependencies:
   ```bash
   npm install
   ```

5. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

6. Seed the database:
   ```bash
   npx prisma db seed
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

The backend will be available at: http://localhost:4000

## Frontend Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Copy the environment example file:
   - Windows:
     ```bash
     copy .env.example .env
     ```
   - macOS/Linux:
     ```bash
     cp .env.example .env
     ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at: http://localhost:5273 (or the port shown by Vite)

## Demo Login

- Email: demo@memaide.local
- Password: Password123!

## Troubleshooting

### Port 5432 is busy
If PostgreSQL port 5432 is already in use:
- Stop any existing PostgreSQL containers: `docker ps` to find containers, then `docker stop <container-id>`
- Or modify the port mapping in `server/docker-compose.yml` (change `"5432:5432"` to `"5433:5432"` for example)

### Port 4000 is busy
If the backend port 4000 is already in use:
- Stop the process using port 4000
- Or modify the PORT value in `server/.env`

### Port 5273/5173 is busy
If the frontend port is already in use:
- Use the port that Vite prints when you run `npm run dev`
- Or modify the Vite config if needed

### Docker Compose not found
If Docker says "no compose file":
- Make sure you're running the command from inside the `server/` directory
- Verify `docker-compose.yml` exists in the `server/` directory

### Database connection issues
If the backend can't connect to the database:
- Ensure PostgreSQL container is running: `docker ps`
- Check Docker Desktop is running
- Verify DATABASE_URL in `server/.env` matches the docker-compose configuration

## Additional Commands

### Backend
- Build: `npm run build`
- Run tests: `npm run test`
- Start production server: `npm start`
- Prisma Studio: `npm run prisma:studio`

### Frontend
- Build: `npm run build`
- Lint: `npm run lint`
- Preview build: `npm run preview`
