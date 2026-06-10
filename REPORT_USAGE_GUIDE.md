# Report Usage Guide - MediConnect Diagrams

This guide explains where each generated diagram should be placed in a thesis report, internship report, or supervisor presentation.

## Recommended Report Placement

| Diagram file | Suggested chapter | Suggested figure caption |
| --- | --- | --- |
| `SYSTEM_ARCHITECTURE_DIAGRAM.md` | System Design / Architecture | Figure 4.1 - MediConnect System Architecture Diagram |
| `USE_CASE_DIAGRAM.md` | Requirements Analysis | Figure 4.2 - MediConnect Use Case Diagram |
| `DATABASE_ERD.md` | Database Design | Figure 4.3 - MediConnect Database Entity Relationship Diagram |
| `SEQUENCE_DIAGRAMS.md` | System Workflows / Detailed Design | Figures 4.4 to 4.10 - Main System Sequence Diagrams |

## Diagram Explanations

### System Architecture Diagram

Use this diagram to introduce the overall system structure. It explains how patients, doctors, and administrators interact with the React frontend, how the frontend communicates with the Express REST API, and how the backend coordinates authentication, authorization, services, database access, file storage, video-room integration, and audit logging.

**Recommended placement:** System Architecture section.

### Use Case Diagram

Use this diagram to summarize what each actor can do in the system. It is useful near the beginning of the report because it connects user requirements to implemented features such as appointment booking, schedule management, medical records, consultation notes, audit log review, and video consultation.

**Recommended placement:** Functional Requirements or Use Case Analysis section.

### Database ERD

Use this diagram to explain persistent data storage. It shows the relationship between users, doctor profiles, schedules, leave requests, appointments, symptom summaries, medical records, uploaded documents, consultation notes, and audit logs.

**Recommended placement:** Database Design section.

### Login and JWT Authentication Sequence

This diagram is best used when explaining security. It shows how the backend verifies credentials, uses bcrypt for password comparison, and returns a JWT token for protected API requests.

**Recommended placement:** Authentication and Security subsection.

### Appointment Booking Sequence

This diagram demonstrates appointment booking correctness. It shows slot generation, approved leave checking, duplicate booking prevention, and pending appointment creation.

**Recommended placement:** Appointment Management subsection.

### Medical Record Upload Sequence

This diagram explains how file upload is handled securely. It highlights JWT authentication, ownership checks, MIME validation, storage adapter usage, and database metadata storage.

**Recommended placement:** Medical Record Management subsection.

### Symptom Chatbot Summary Sequence

This diagram should be used to clarify that the chatbot is rule-based and only collects information. It saves structured symptom summaries but does not provide diagnosis or prescription.

**Recommended placement:** Chatbot / Symptom Collection subsection.

### Consultation Note Sequence

This diagram explains the doctor workflow for writing consultation results. It shows that the backend verifies the assigned appointment before creating a consultation note.

**Recommended placement:** Doctor Consultation Workflow subsection.

### Video Consultation Sequence

This diagram explains the MVP teleconsultation approach. The system uses an external Jitsi Meet room link for confirmed appointments instead of building a custom WebRTC infrastructure.

**Recommended placement:** Teleconsultation / Video Consultation subsection.

### Admin Audit Log Review Sequence

This diagram demonstrates traceability and admin monitoring. It shows how audit logs are protected by admin-only authorization and loaded with pagination.

**Recommended placement:** Administration, Security, or Auditability subsection.

## Most Important Diagrams for Supervisor Review

1. `SYSTEM_ARCHITECTURE_DIAGRAM.md` - shows the complete technical structure.
2. `DATABASE_ERD.md` - proves that the database relationships are well designed.
3. `SEQUENCE_DIAGRAMS.md` appointment booking diagram - demonstrates the most important business workflow.
4. `SEQUENCE_DIAGRAMS.md` medical record upload diagram - demonstrates file security and storage design.
5. `USE_CASE_DIAGRAM.md` - provides a clear non-technical overview of system scope.

## Presentation Tips

- Start with the use case diagram to explain the system from the user's perspective.
- Move to the architecture diagram to explain the implementation structure.
- Use the ERD to show how data is stored and related.
- Use sequence diagrams only for the workflows your supervisor asks about in detail.
- Emphasize that the chatbot does not diagnose or prescribe, and that video consultation uses lightweight external room integration for the MVP.
