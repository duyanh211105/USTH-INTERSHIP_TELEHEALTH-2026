# Database ERD - MediConnect

This document describes the main database structure of the Telehealth Consultation and Medical Record Management System. The schema is implemented in `server/src/db/schema.js`. SQLite is the default local development database, while PostgreSQL support is available through the PostgreSQL-ready schema and `DB_CLIENT=postgres`.

## Entity Relationship Diagram

```mermaid
erDiagram
  users ||--o| doctor_profiles : user_id
  users ||--o{ appointments : patient_id
  users ||--o{ appointments : doctor_id
  users ||--o{ doctor_schedules : doctor_id
  users ||--o{ leave_requests : doctor_id
  users ||--o{ leave_requests : reviewed_by
  users ||--o{ medical_records : patient_id
  users ||--o{ symptom_summaries : patient_id
  users ||--o{ consultation_notes : doctor_id
  users ||--o{ consultation_notes : patient_id
  users ||--o{ audit_logs : actor_user_id
  appointments ||--o{ consultation_notes : appointment_id
  medical_records ||--o{ medical_documents : record_id

  users {
    integer id PK
    text name
    text email UK
    text password_hash
    text phone
    text national_id UK
    text permanent_address
    text role
    text status
    text created_at
  }

  doctor_profiles {
    integer id PK
    integer user_id FK
    text specialty
    text bio
    text availability
    text availability_summary
    real consultation_fee
    real rating
    integer patients_count
  }

  doctor_schedules {
    integer id PK
    integer doctor_id FK
    integer weekday
    text start_time
    text end_time
    integer slot_duration
    text created_at
    text updated_at
  }

  leave_requests {
    integer id PK
    integer doctor_id FK
    text date
    text reason
    text note
    text status
    integer reviewed_by FK
    text reviewed_at
    text created_at
    text updated_at
  }

  appointments {
    integer id PK
    integer patient_id FK
    integer doctor_id FK
    text scheduled_date
    text scheduled_time
    text reason
    text status
    text cancellation_reason
    integer cancelled_by FK
    text cancelled_at
    text video_room_url
    text video_room_provider
    text created_at
  }

  symptom_summaries {
    integer id PK
    integer patient_id FK
    text main_symptom
    text duration
    text severity
    text fever
    text temperature
    text medication
    text allergies
    text previous_history
    text conditional_answers
    text red_flags
    text priority
    text doctor_summary
    text summary
    text created_at
  }

  medical_records {
    integer id PK
    integer patient_id FK
    text title
    text category
    text notes
    text created_at
  }

  medical_documents {
    integer id PK
    integer record_id FK
    text filename
    text original_name
    text mime_type
    integer size
    text path
    text url
    text storage_provider
    text storage_key
    text uploaded_at
  }

  consultation_notes {
    integer id PK
    integer appointment_id FK
    integer doctor_id FK
    integer patient_id FK
    text symptoms
    text diagnosis
    text prescription
    text advice
    text follow_up
    text created_at
  }

  audit_logs {
    integer id PK
    integer actor_user_id FK
    text actor_role
    text action
    text entity_type
    integer entity_id
    text metadata_json
    text ip_address
    text created_at
  }
```

**Figure 4.3 - MediConnect Database Entity Relationship Diagram**

This ERD shows the central entities and their foreign key relationships. The `users` table stores all patient, doctor, and admin accounts. Doctor-specific profile data is stored in `doctor_profiles`, while appointments connect patient users and doctor users through `patient_id` and `doctor_id`. Medical records and documents are separated so that one record may contain multiple uploaded files. Consultation notes are linked to appointments and to both doctor and patient users. Audit logs are associated with the actor user when available.

**Purpose:** This diagram should be used in the database design chapter to explain how authentication, appointments, medical records, consultations, schedules, leave requests, and audit tracking are persisted.

## Relationship Notes

- `appointments.patient_id` references `users.id` for the patient account.
- `appointments.doctor_id` references `users.id` for the doctor account. The doctor profile is connected through `doctor_profiles.user_id`.
- `doctor_schedules.doctor_id` and `leave_requests.doctor_id` reference doctor users in `users`.
- `consultation_notes.appointment_id` connects a note to the appointment workflow.
- `medical_documents.record_id` connects uploaded files to their medical record container.
- `audit_logs.actor_user_id` is nullable to support anonymous or failed-login audit events.

## PostgreSQL Readiness

The SQLite schema uses `INTEGER PRIMARY KEY AUTOINCREMENT` and text-based timestamps for local development. The PostgreSQL schema maps these concepts to `BIGSERIAL`, `DATE`, `TIME`, `TIMESTAMPTZ`, and `JSONB` where appropriate. This preserves the same logical relationships while supporting a production-ready database backend.
