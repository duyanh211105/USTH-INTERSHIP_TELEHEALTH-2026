# MediConnect - Telehealth Consultation and Medical Record Management System

MediConnect is a full-stack MVP for remote healthcare consultation, appointment scheduling, medical record management, and role-based clinical workflows. It supports patients, doctors, and administrators with a polished healthcare dashboard UI and a modular Express backend.

## Features

### Patient
- Register and log in with real database accounts.
- Use a rule-based symptom chatbot to collect structured symptom summaries.
- Search doctors with normalized specialty filters, name keyword search, fee range, availability date, available-today, video availability, and sorting.
- Book appointments from generated available doctor slots.
- Upload medical documents as PDF, JPG, or PNG.
- Preview uploaded images and open/download PDFs.
- Cancel appointments with a reason.
- View consultation results and join confirmed video consultations.

### Doctor
- View assigned appointments and patient context.
- Manage weekly working schedules with multiple sessions per day.
- Submit leave requests for admin approval.
- View assigned patients' symptom summaries, red flags, and medical records.
- Open uploaded patient files.
- Write consultation notes for assigned appointments.
- Join confirmed video consultations during the allowed access window.

### Admin
- View system metrics, users, appointments, doctors, leave requests, and audit logs.
- Create, edit, deactivate, reactivate, and soft-delete doctors.
- Approve or reject doctor leave requests.
- Protect historical appointments and prevent unsafe doctor deletion.

## Tech Stack

Frontend:
- React + Vite
- React Router
- Tailwind CSS
- Lucide React
- Vitest + Testing Library

Backend:
- Node.js + Express
- SQLite by default for local development
- Optional PostgreSQL support via `pg.Pool`
- JWT authentication
- bcrypt password hashing
- Multer file uploads
- CORS
- Node test runner + Supertest

Storage:
- Local storage adapter by default
- Optional Firebase Storage adapter when Firebase environment variables are configured

Video:
- Lightweight external room integration using Jitsi Meet links
- No custom WebRTC or signaling server in the MVP

## Architecture Overview

```mermaid
flowchart LR
  UI["React + Vite dashboard"] --> APIClient["Central API client + JWT"]
  APIClient --> Express["Express API"]
  Express --> Auth["JWT auth + role checks"]
  Auth --> Controllers["Controllers"]
  Controllers --> Services["Services"]
  Services --> DB["SQLite default / PostgreSQL optional"]
  Services --> Storage["Local storage / Firebase Storage adapter"]
  Services --> Video["Jitsi room URL generation"]
```

Important folders:

```text
src/                         Frontend source code
src/pages/                   Patient, doctor, admin screens
src/components/              Shared UI components
src/services/                API client and frontend service layer
server/src/                  Backend source code
server/src/routes/           Express route definitions
server/src/controllers/      HTTP request handlers
server/src/services/         Business logic
server/src/middleware/       Auth, role, upload, and error middleware
server/src/db/               Database connection, schema, seed, adapters
docs/                        Supporting documentation assets
```

## Setup

Install frontend dependencies:

```powershell
npm.cmd install
```

Install backend dependencies:

```powershell
npm.cmd install --prefix server
```

Create environment files from examples:

```powershell
copy .env.example .env
copy server\.env.example server\.env
```

For local development, SQLite is the simplest option:

```env
DB_CLIENT=sqlite
DB_FILE=server/data/telehealth.sqlite
UPLOAD_DIR=server/uploads
JWT_SECRET=replace-with-a-local-development-secret
```

Initialize and seed the database:

```powershell
npm.cmd run db:init --prefix server
npm.cmd run seed --prefix server
```

## Run Locally

Start the backend:

```powershell
npm.cmd run dev --prefix server
```

Start the frontend in a second terminal:

```powershell
npm.cmd run dev
```

Open the app:

```text
http://localhost:5173
```

Default API URL:

```text
http://localhost:4000
```

## Demo Accounts

After seeding:

| Role | Email | Password |
| --- | --- | --- |
| Patient | `patient@example.com` | `password123` |
| Doctor | `doctor@example.com` | `password123` |
| Admin | `admin@example.com` | `password123` |

## Testing and Build

Run frontend tests:

```powershell
npm.cmd run test
```

Run backend tests:

```powershell
npm.cmd run test --prefix server
```

Run production build:

```powershell
npm.cmd run build
```

## Video Consultation Overview

Video consultation is implemented as a lightweight MVP integration:

- When an appointment becomes `CONFIRMED`, the backend creates a deterministic Jitsi room URL.
- Only the assigned patient and assigned doctor can fetch the room URL.
- The Join Video Call button is available from 15 minutes before the appointment until the appointment ends.
- If no duration is stored, the system assumes 60 minutes.
- Public `meet.jit.si` rooms may require the first participant to log in as a moderator before other users can enter.

Out of scope for the MVP:

- Custom WebRTC infrastructure
- Signaling server
- Call recording
- Screen sharing management
- Real-time transcription

## Firebase Storage Fallback Behavior

Medical document uploads use a storage adapter architecture.

If Firebase environment variables are configured, files are uploaded to Firebase Storage and the backend stores:

- original filename
- MIME type
- file size
- storage provider
- storage key
- download URL

If Firebase variables are missing, the backend automatically falls back to local storage in `server/uploads`.

The backend still enforces:

- JWT authentication
- ownership checks
- MIME validation
- maximum upload size
- file type restrictions

## Chatbot Scope and Safety Disclaimer

The chatbot is rule-based and intent-based. It can:

- collect symptoms step by step
- ask conditional follow-up questions
- detect red-flag text
- mark symptom priority as `NORMAL` or `HIGH`
- help users navigate booking, uploads, appointments, and schedules

The chatbot does not:

- diagnose medical conditions
- prescribe medication
- replace professional medical advice
- handle emergencies

Emergency-like messages should direct users to seek immediate emergency medical care.

## PostgreSQL Optional Setup

SQLite remains the default local development database. PostgreSQL is optional for production-style deployments.

Example PostgreSQL configuration:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://postgres:password@localhost:5432/telehealth
```

Initialize PostgreSQL schema:

```powershell
npm.cmd run db:init:postgres --prefix server
```

Seed PostgreSQL after setting `DB_CLIENT=postgres` and `DATABASE_URL`:

```powershell
npm.cmd run seed --prefix server
```

## API Overview

Main API groups:

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`
- `GET /doctors`
- `GET /doctors/:id/slots`
- `GET /appointments`
- `POST /appointments`
- `PATCH /appointments/:id/status`
- `GET /appointments/:id/video-room`
- `GET /appointments/:id/calendar.ics`
- `GET /records`
- `POST /records`
- `POST /records/:id/upload`
- `DELETE /records/:recordId`
- `POST /symptoms`
- `GET /symptoms/patient/:patientId`
- `GET /consultations`
- `POST /consultations`
- `GET /admin/summary`
- `GET /admin/users`
- `GET /admin/appointments`
- `GET /admin/doctors`
- `POST /admin/doctors`
- `GET /admin/audit-logs`

### Doctor Search Parameters

`GET /doctors` supports optional query filters for the patient booking workflow:

| Query param | Purpose |
| --- | --- |
| `q` | Case-insensitive partial search across doctor name and specialty. |
| `specialty` | Normalized specialty code such as `CARDIOLOGY`, `PEDIATRICS`, or `GENERAL_MEDICINE`. |
| `date` | Return doctors with generated available slots on that date. |
| `availableToday` | Return doctors with available slots today. |
| `minFee` / `maxFee` | Filter by consultation fee range when provided. |
| `videoAvailable` | Keep doctors compatible with the MVP video consultation workflow. |
| `sort` | Supports `lowest_fee`, `highest_fee`, `earliest_availability`, and `highest_rating`. |

Specialties are controlled in the UI and normalized in the backend. Legacy values such as `heart`, `Heart Doctor`, or `tim` map to `CARDIOLOGY`, which keeps filtering reliable without requiring a separate specialties table yet.

## Screenshots and Demo

Add screenshots before publishing if available:

```text
docs/screenshots/login.png
docs/screenshots/patient-dashboard.png
docs/screenshots/doctor-dashboard.png
docs/screenshots/admin-dashboard.png
docs/screenshots/chatbot.png
docs/screenshots/video-call.png
```

Suggested demo flow:

1. Patient registers and logs in.
2. Admin creates a doctor.
3. Doctor configures schedule and submits leave request.
4. Admin approves or rejects leave request.
5. Patient uses chatbot and books an appointment.
6. Patient uploads medical records.
7. Doctor views assigned patient and opens uploaded file.
8. Doctor joins video room and writes consultation note.
9. Patient views consultation result.

See:

- `DEMO_GUIDE.md`
- `CODE_WALKTHROUGH_GUIDE.md`
- `DATABASE_ERD.md`

## MVP Limitations

- Medical files are stored locally unless Firebase Storage is configured.
- SQLite is the default local development database.
- PostgreSQL support is optional and intended for production-style deployment.
- Video consultation uses external Jitsi room links instead of custom WebRTC.
- Public Jitsi rooms may require moderator login.
- The chatbot does not diagnose or prescribe.
- No email/SMS notification workflow yet.
- No payment workflow yet.
- No call recording, screen sharing management, or transcription.

## Future Improvements

- Replace local storage with hardened Firebase Storage rules, signed URLs, lifecycle policies, and malware scanning.
- Extend doctor discovery with language, insurance, hospital affiliation, and richer specialty taxonomy.
- Add Google Calendar sync for doctors and patients.
- Add email/SMS notifications for booking, cancellation, leave approval, and consultation completion.
- Add detailed audit export, retention policies, and anomaly detection.
- Replace SQLite with PostgreSQL for production deployment.
- Add provider abstraction for video meeting platforms.
- Add payment workflow if consultation fees become transactional.

## GitHub Safety Notes

Before pushing:

- Do not commit `.env` or `server/.env`.
- Do not commit Firebase private keys.
- Do not commit `server/data`, `server/server/data`, or SQLite database files.
- Do not commit uploaded medical files from `server/uploads` or `server/server/uploads`.
- Do not commit `node_modules`, `dist`, local PostgreSQL data, or log files.

The `.gitignore` file is configured to exclude these runtime and private files.
