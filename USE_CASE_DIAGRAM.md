# Use Case Diagram - MediConnect

This document presents the main user-facing capabilities of the Telehealth Consultation and Medical Record Management System. Mermaid flowchart syntax is used to create a GitHub-compatible use case-style diagram.

## Use Case Overview

```mermaid
flowchart LR
  Patient["Patient"]
  Doctor["Doctor"]
  Admin["Admin"]

  subgraph PatientUseCases["Patient Use Cases"]
    P1("Register / Login")
    P2("Search Doctor by Specialty")
    P3("Book Appointment")
    P4("Upload / View / Delete Medical Records")
    P5("Use Symptom Chatbot")
    P6("View Consultation Result")
    P7("Join Video Consultation")
    P8("Export Calendar Event")
  end

  subgraph DoctorUseCases["Doctor Use Cases"]
    D1("Login")
    D2("Manage Schedule")
    D3("Submit Leave Request")
    D4("View Assigned Appointments")
    D5("View Patient Detail")
    D6("View Medical Records")
    D7("Write Consultation Note")
    D8("Join Video Consultation")
  end

  subgraph AdminUseCases["Admin Use Cases"]
    A1("Login")
    A2("Manage Doctors")
    A3("Approve / Reject Leave Requests")
    A4("View Audit Logs")
    A5("Monitor Dashboard")
  end

  Patient --> P1
  Patient --> P2
  Patient --> P3
  Patient --> P4
  Patient --> P5
  Patient --> P6
  Patient --> P7
  Patient --> P8

  Doctor --> D1
  Doctor --> D2
  Doctor --> D3
  Doctor --> D4
  Doctor --> D5
  Doctor --> D6
  Doctor --> D7
  Doctor --> D8

  Admin --> A1
  Admin --> A2
  Admin --> A3
  Admin --> A4
  Admin --> A5
```

**Figure 4.2 - MediConnect Use Case Diagram**

This use case-style diagram summarizes the functional scope of the system for patients, doctors, and administrators. It shows how each actor accesses role-specific workflows such as appointment booking, schedule management, medical record handling, leave approval, video consultation, and audit log review.

**Purpose:** This diagram should be used in the requirements analysis chapter to communicate the expected interactions between system actors and the application.
