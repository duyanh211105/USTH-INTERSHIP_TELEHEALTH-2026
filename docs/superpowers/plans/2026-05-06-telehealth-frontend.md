# Telehealth Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished frontend-only telehealth dashboard demo using React, Vite, Tailwind CSS, React Router, Lucide icons, and mock data.

**Architecture:** The app uses route-level pages composed from shared dashboard components and local mock data. The layout has a responsive sidebar and top header, with separate patient, doctor, and admin flows.

**Tech Stack:** React, Vite, Tailwind CSS, React Router, Lucide React, Vitest, Testing Library.

---

### Task 1: Scaffold Frontend

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.js`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/index.css`

- [ ] Add project config and install dependencies.
- [ ] Create a route shell with `/login`, `/patient`, `/doctor`, and `/admin`.
- [ ] Run the initial test command and confirm missing UI tests fail before implementation.

### Task 2: Shared Components

**Files:**
- Create: `src/components/Button.jsx`
- Create: `src/components/Card.jsx`
- Create: `src/components/StatusBadge.jsx`
- Create: `src/components/Avatar.jsx`
- Create: `src/components/DataTable.jsx`
- Create: `src/components/EmptyState.jsx`
- Create: `src/layouts/DashboardLayout.jsx`

- [ ] Build reusable presentation components.
- [ ] Build a responsive sidebar and header dashboard shell.

### Task 3: Mock Data

**Files:**
- Create: `src/data/mockData.js`

- [ ] Add users, doctors, patients, appointments, records, consultation notes, chatbot messages, and metrics.

### Task 4: Pages

**Files:**
- Create: `src/pages/LoginPage.jsx`
- Create: `src/pages/patient/PatientDashboard.jsx`
- Create: `src/pages/patient/ChatbotPage.jsx`
- Create: `src/pages/patient/BookAppointmentPage.jsx`
- Create: `src/pages/patient/MedicalRecordsPage.jsx`
- Create: `src/pages/patient/ConsultationResultPage.jsx`
- Create: `src/pages/doctor/DoctorDashboard.jsx`
- Create: `src/pages/doctor/PatientDetailPage.jsx`
- Create: `src/pages/doctor/ConsultationNotePage.jsx`
- Create: `src/pages/admin/AdminDashboard.jsx`

- [ ] Implement each route with polished healthcare dashboard UI.
- [ ] Keep all interactions local and mock-only.

### Task 5: Verification

**Files:**
- Create: `src/test/App.test.jsx`
- Create: `src/test/setup.js`

- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Start the local Vite dev server and report the URL.
