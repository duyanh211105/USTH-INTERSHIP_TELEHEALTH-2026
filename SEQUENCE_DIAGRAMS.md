# Sequence Diagrams - MediConnect

This document contains focused Mermaid sequence diagrams for the main workflows in the Telehealth Consultation and Medical Record Management System. Each diagram follows the current route, controller, service, database, storage, and external integration structure.

## A. Login and JWT Authentication

```mermaid
sequenceDiagram
  actor User
  participant Frontend as React Frontend
  participant Route as Auth Route
  participant Controller as authController
  participant Service as authService
  participant DB as Database

  User->>Frontend: Submit email and password
  Frontend->>Route: POST /auth/login
  Route->>Controller: login(req, res)
  Controller->>Service: authenticate credentials
  Service->>DB: Find user by email
  DB-->>Service: User with password_hash
  Service->>Service: Compare password with bcrypt
  Service-->>Controller: JWT token and safe user object
  Controller-->>Frontend: Success response
  Frontend->>Frontend: Store JWT token
```

**Figure 4.4 - Login and JWT Authentication Sequence Diagram**

This sequence diagram illustrates how the frontend authenticates a user through the Express backend. The backend verifies the password using bcrypt and returns a JWT token without exposing the password hash.

**Purpose:** Use this diagram in the security or authentication section to explain token-based login and protected API access.

## B. Patient Appointment Booking

```mermaid
sequenceDiagram
  actor Patient
  participant Frontend as React Frontend
  participant Route as Appointment Route
  participant Controller as appointmentController
  participant Service as appointmentService
  participant Schedule as scheduleService
  participant DB as Database

  Patient->>Frontend: Select doctor, date, slot, and reason
  Frontend->>Route: POST /appointments with JWT
  Route->>Controller: postAppointment(req, res)
  Controller->>Service: create appointment request
  Service->>DB: Verify doctor and patient
  Service->>Schedule: generateSlots(date, doctorId)
  Schedule->>DB: Read doctor_schedules and approved leave_requests
  Schedule->>DB: Read booked appointments
  Schedule-->>Service: Available slots
  Service->>Service: Check duplicate request and slot lock
  Service->>DB: Insert PENDING appointment
  Service-->>Controller: Appointment result
  Controller-->>Frontend: Success or duplicate response
  Frontend-->>Patient: Show booking notification
```

**Figure 4.5 - Appointment Booking Sequence Diagram**

This sequence diagram shows how appointment booking is validated against doctor schedules, approved leave requests, existing locked appointments, and idempotency rules before a pending appointment is created.

**Purpose:** Use this diagram in the appointment scheduling chapter to explain booking correctness and duplicate-slot prevention.

## C. Medical Record Upload

```mermaid
sequenceDiagram
  actor Patient
  participant Frontend as React Frontend
  participant Route as Record Route
  participant Middleware as Auth and Upload Middleware
  participant Controller as recordController
  participant Service as recordService
  participant Storage as storageService
  participant DB as Database

  Patient->>Frontend: Choose PDF, JPG, or PNG file
  Frontend->>Route: POST /records/:id/upload multipart/form-data
  Route->>Middleware: Validate JWT, ownership, file type, and size
  Middleware->>Controller: uploadRecordDocument(req, res)
  Controller->>Service: Save document metadata
  Service->>Storage: Store file using active adapter
  Storage-->>Service: File URL and storage key
  Service->>DB: Insert medical_documents row
  Service-->>Controller: Uploaded document
  Controller-->>Frontend: File metadata and URL
  Frontend-->>Patient: Show upload success and file actions
```

**Figure 4.6 - Medical Record Upload Sequence Diagram**

This sequence diagram explains how patient medical files are uploaded through multipart form data, validated by middleware, stored through the storage adapter, and recorded in the database as document metadata.

**Purpose:** Use this diagram in the medical record management chapter to demonstrate upload security and storage abstraction.

## D. Symptom Chatbot Summary Save

```mermaid
sequenceDiagram
  actor Patient
  participant Frontend as Chatbot Page
  participant Route as Symptom Route
  participant Controller as symptomController
  participant Service as symptomService
  participant DB as Database

  Patient->>Frontend: Answer rule-based symptom questions
  Frontend->>Frontend: Build structured summary and priority
  Frontend->>Route: POST /symptoms with JWT
  Route->>Controller: postSymptom(req, res)
  Controller->>Service: Create symptom summary
  Service->>DB: Insert symptom_summaries row
  DB-->>Service: Stored summary
  Service-->>Controller: Symptom summary
  Controller-->>Frontend: Success response
  Frontend-->>Patient: Show structured summary card
```

**Figure 4.7 - Symptom Chatbot Summary Save Sequence Diagram**

This sequence diagram shows how the rule-based chatbot collects symptom answers, creates a structured summary, and saves the result to the backend. The chatbot does not diagnose or prescribe.

**Purpose:** Use this diagram in the chatbot or patient workflow chapter to clarify the safety boundary and data persistence flow.

## E. Doctor Consultation Note Creation

```mermaid
sequenceDiagram
  actor Doctor
  participant Frontend as React Frontend
  participant Route as Consultation Route
  participant Controller as consultationController
  participant Service as consultationService
  participant DB as Database

  Doctor->>Frontend: Open assigned appointment note page
  Frontend->>Route: POST /consultations with JWT
  Route->>Controller: postConsultation(req, res)
  Controller->>Service: Create consultation note
  Service->>DB: Verify appointment belongs to doctor
  Service->>DB: Insert consultation_notes row
  Service->>DB: Update appointment status to COMPLETED
  Service-->>Controller: Consultation note
  Controller-->>Frontend: Success response
  Frontend-->>Doctor: Show save confirmation
```

**Figure 4.8 - Doctor Consultation Note Creation Sequence Diagram**

This sequence diagram illustrates how a doctor writes a consultation note for an assigned appointment. The backend verifies ownership before storing the note and updating the appointment status.

**Purpose:** Use this diagram in the consultation workflow chapter to explain doctor-side clinical documentation and authorization.

## F. Lightweight Video Consultation with Jitsi

```mermaid
sequenceDiagram
  actor User as Patient or Doctor
  participant Frontend as React Frontend
  participant Route as Appointment Route
  participant Controller as appointmentController
  participant Service as appointmentService
  participant DB as Database
  participant Jitsi as Jitsi Meet

  User->>Frontend: Click Join Video Call
  Frontend->>Route: GET /appointments/:id/video-room with JWT
  Route->>Controller: getAppointmentVideoRoom(req, res)
  Controller->>Service: Resolve video room access
  Service->>DB: Load appointment and participant IDs
  Service->>Service: Check CONFIRMED status and access window
  Service->>DB: Read or generate video_room_url
  Service-->>Controller: Jitsi room URL
  Controller-->>Frontend: Video room response
  Frontend->>Jitsi: Open room URL in new tab
```

**Figure 4.9 - Lightweight Video Consultation Sequence Diagram**

This sequence diagram shows the MVP video consultation workflow. The application does not implement a custom WebRTC or signaling server; it provides controlled access to a deterministic Jitsi Meet room link for confirmed appointments.

**Purpose:** Use this diagram in the teleconsultation section to explain the lightweight video-call integration and its authorization rules.

## G. Admin Audit Log Review

```mermaid
sequenceDiagram
  actor Admin
  participant Frontend as Admin Dashboard
  participant Route as Admin Route
  participant Controller as adminController
  participant Service as auditService
  participant DB as Database

  Admin->>Frontend: Open Audit Logs page
  Frontend->>Route: GET /admin/audit-logs with filters
  Route->>Route: requireAuth and requireRole(admin)
  Route->>Controller: getAuditLogs(req, res)
  Controller->>Service: listAuditLogs(query)
  Service->>DB: Query audit_logs with pagination
  DB-->>Service: Logs and total count
  Service-->>Controller: Paginated audit log result
  Controller-->>Frontend: Audit logs response
  Frontend-->>Admin: Render audit table and pagination
```

**Figure 4.10 - Admin Audit Log Review Sequence Diagram**

This sequence diagram describes how administrators review audit logs through a protected admin API. The backend enforces admin-only access and returns paginated results to avoid loading excessive log data.

**Purpose:** Use this diagram in the security, administration, or traceability chapter to show how important system actions are monitored.
