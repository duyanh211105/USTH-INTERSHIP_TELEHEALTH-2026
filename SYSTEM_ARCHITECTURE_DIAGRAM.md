# System Architecture Diagram - MediConnect

This document provides a report-ready architecture diagram for the Telehealth Consultation and Medical Record Management System. The diagram is based on the current React frontend, Express backend, database schema, storage services, audit logging, and Jitsi Meet video-room integration.

## System Architecture

```mermaid
flowchart TB
  subgraph Actors["System Actors"]
    Patient["Patient"]
    Doctor["Doctor"]
    Admin["Admin"]
  end

  subgraph Frontend["React + Vite Frontend"]
    UI["Healthcare Dashboard UI"]
    Router["React Router"]
    ApiClient["Central API Client"]
  end

  subgraph Backend["Express REST API Backend"]
    Routes["API Routes"]
    Auth["JWT Auth Middleware"]
    RBAC["Role and Ownership Checks"]
    Controllers["Controllers Layer"]
    Services["Services Layer"]
  end

  subgraph DataLayer["Database Layer"]
    SQLite["SQLite Database (Default Local Development)"]
    Postgres["PostgreSQL-ready Schema (Optional Production Backend)"]
  end

  subgraph StorageLayer["Medical File Storage"]
    StorageService["Storage Service"]
    LocalStorage["Local Storage Adapter (server/uploads)"]
    FirebaseStorage["Firebase Storage Adapter (Optional)"]
  end

  subgraph External["External Integration"]
    Jitsi["Jitsi Meet Room Link (Confirmed Appointments)"]
  end

  Audit["Audit Logs (audit_logs)"]

  Patient --> UI
  Doctor --> UI
  Admin --> UI

  UI --> Router
  Router --> ApiClient
  ApiClient --> Routes

  Routes --> Auth
  Auth --> RBAC
  RBAC --> Controllers
  Controllers --> Services

  Services --> SQLite
  Services -. "DB_CLIENT=postgres" .-> Postgres
  Services --> StorageService
  StorageService --> LocalStorage
  StorageService -. "Firebase env configured" .-> FirebaseStorage
  Services --> Jitsi
  Services --> Audit
  Audit --> SQLite
  Audit -. "PostgreSQL-ready" .-> Postgres
```

**Figure 4.1 - MediConnect System Architecture Diagram**

This architecture diagram illustrates how the three user roles interact with the React frontend, which communicates with the Express REST API through a centralized API client. The backend applies JWT authentication, role-based authorization, and ownership checks before delegating business logic to modular service classes. The system uses SQLite for local development while preserving PostgreSQL-ready schema support, and it abstracts medical document storage through local and Firebase-compatible adapters.

**Purpose:** This diagram should be used in the system design or architecture chapter to explain the overall structure, major components, and integration boundaries of the application.
