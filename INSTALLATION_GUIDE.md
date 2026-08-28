# Installation Guide

## Project Overview

This project is a Telehealth Consultation and Medical Record Management System built with a React + Vite frontend and a Node.js + Express backend. The system supports phone-number login, role-based dashboards, doctor discovery, appointment booking, chatbot symptom intake, medical record upload, consultation notes, doctor ratings, schedule and leave management, audit logs, and lightweight video consultation through Jitsi Meet links.

## System Requirements

- Node.js 20 or later
- npm 10 or later
- Windows, macOS, or Linux
- SQLite for default local development
- Optional: PostgreSQL for production-style deployment
- Optional: Firebase Storage credentials for cloud medical document storage

## Project Structure

```text
.
├── src/                  # React frontend source code
├── server/               # Express backend source code
│   ├── src/              # Backend routes, controllers, services, middleware, and database code
│   ├── package.json      # Backend dependencies and scripts
│   └── .env.example      # Backend environment template
├── docs/                 # Project planning and supporting documentation
├── package.json          # Frontend dependencies and scripts
├── .env.example          # Frontend/backend environment example
├── README.md
└── INSTALLATION_GUIDE.md
```

## Environment Configuration

Create environment files from the provided examples.

For the frontend:

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

For the backend:

```bash
cd server
copy .env.example .env
```

On macOS/Linux:

```bash
cd server
cp .env.example .env
```

Recommended local backend configuration:

```env
PORT=4000
JWT_SECRET=replace-with-a-local-development-secret
DB_CLIENT=sqlite
DB_FILE=./data/telehealth.sqlite
UPLOAD_DIR=./uploads
```

The frontend should point to the backend API:

```env
VITE_API_URL=http://localhost:4000
```

## Install Frontend Dependencies

From the project root:

```bash
npm install
```

On Windows PowerShell, this can also be run as:

```powershell
npm.cmd install
```

## Install Backend Dependencies

From the project root:

```bash
cd server
npm install
```

On Windows PowerShell:

```powershell
cd server
npm.cmd install
```

## Initialize and Seed the Backend Database

From the `server` folder:

```bash
npm run db:init
npm run seed
```

On Windows PowerShell:

```powershell
npm.cmd run db:init
npm.cmd run seed
```

The seed script creates demo data that can be used for local testing.

## Run the Backend

From the `server` folder:

```bash
npm run dev
```

On Windows PowerShell:

```powershell
npm.cmd run dev
```

Default backend URL:

```text
http://localhost:4000
```

## Run the Frontend

Open a second terminal from the project root:

```bash
npm run dev
```

On Windows PowerShell:

```powershell
npm.cmd run dev
```

Default frontend URL:

```text
http://localhost:5173
```

## Default Local URLs

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:4000` |

## Notes About SQLite

SQLite is the default local development database. It is lightweight and requires no separate database server. The runtime SQLite database file is generated locally after running the database initialization and seed scripts. Runtime database files are intentionally not included in the submission ZIP.

## Notes About Firebase Storage

The backend includes a storage adapter architecture. If Firebase Storage environment variables are configured, medical files can be stored in Firebase Storage. If Firebase credentials are missing, the backend automatically falls back to local file storage under the configured upload directory. Uploaded runtime files are not included in the submission ZIP.

## Notes About Jitsi Meet

Video consultation is implemented using lightweight Jitsi Meet room links for confirmed appointments. The project does not include a custom WebRTC or signaling server. Users join the generated Jitsi room from the web dashboard when appointment status and time-window rules allow access.

## Testing

Frontend tests:

```bash
npm run test
```

Backend tests:

```bash
npm run test --prefix server
```

Production frontend build:

```bash
npm run build
```

On Windows PowerShell, use `npm.cmd` if normal `npm` execution is blocked by PowerShell execution policy.
