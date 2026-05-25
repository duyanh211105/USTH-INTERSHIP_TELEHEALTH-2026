# Telehealth Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-only Express + SQLite API for the telehealth MVP without changing the existing frontend UI.

**Architecture:** The backend lives in an independent `server/` package with Express routes, controllers, services, middleware, and SQLite database modules. Authentication uses JWT and bcrypt, files upload locally with Multer, and every route returns consistent JSON.

**Tech Stack:** Node.js, Express, built-in `node:sqlite`, JWT, bcrypt, CORS, Multer, Vitest, Supertest.

---

### Task 1: Backend Test Harness

**Files:**
- Create: `server/package.json`
- Create: `server/src/__tests__/api.test.js`

- [ ] Add tests for login/me, doctors, appointments, records, symptoms, consultations, and admin endpoints.
- [ ] Run `npm.cmd run test --prefix server` and verify it fails because the Express app does not exist yet.

### Task 2: Database and Seed

**Files:**
- Create: `server/src/db/connection.js`
- Create: `server/src/db/schema.js`
- Create: `server/src/db/seed.js`

- [ ] Create SQLite tables: `users`, `doctor_profiles`, `appointments`, `medical_records`, `medical_documents`, `symptom_summaries`, `consultation_notes`.
- [ ] Seed patient, doctor, and admin demo accounts with bcrypt-hashed `password123`.

### Task 3: Middleware and Services

**Files:**
- Create: `server/src/middleware/auth.js`
- Create: `server/src/middleware/roles.js`
- Create: `server/src/middleware/ownership.js`
- Create: `server/src/middleware/upload.js`
- Create: `server/src/middleware/errors.js`
- Create service files under `server/src/services`.

- [ ] Implement JWT auth, role checks, ownership checks, Multer upload, and consistent response/error helpers.

### Task 4: Routes and Controllers

**Files:**
- Create controller files under `server/src/controllers`.
- Create route files under `server/src/routes`.
- Create: `server/src/app.js`
- Create: `server/src/server.js`

- [ ] Implement all requested API endpoints.
- [ ] Wire CORS, JSON parsing, static upload serving, and error handling.

### Task 5: Verification

- [ ] Run `npm.cmd run test --prefix server`.
- [ ] Run `npm.cmd run seed --prefix server`.
- [ ] Run frontend `npm.cmd run test` and `npm.cmd run build` to confirm UI remains unchanged.
