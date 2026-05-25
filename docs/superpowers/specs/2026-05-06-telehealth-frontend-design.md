# Telehealth Frontend Design

## Goal

Build a frontend-only React demo for a web-based telehealth consultation and medical record management system. The demo uses mock data only and presents patient, doctor, and admin workflows in a polished healthcare dashboard UI.

## Scope

Included:
- React + Vite frontend
- Tailwind CSS styling
- React Router routes
- Lucide React icons
- Mock data for all screens
- Login role shortcuts
- Patient dashboard, chatbot, appointment booking, medical records, and result pages
- Doctor dashboard, patient detail, and consultation note pages
- Admin overview page

Excluded:
- Backend APIs
- Real authentication
- Real file upload/storage
- Diagnosis or prescription generation by chatbot

## Visual Direction

The interface follows the referenced Figma healthcare dashboard style: left sidebar navigation, top header, white and light-gray content surfaces, soft blue and green medical accents, compact cards, status badges, clean tables, profile panels, and form layouts suitable for presentation.

## Architecture

The app is organized around reusable UI components, route-level pages, and local mock data. Shared components handle dashboard shells, cards, buttons, badges, tables, avatars, and empty states. Pages compose those components around patient, doctor, and admin workflows.

## Routes

- `/login`: demo role selection
- `/patient`: patient overview
- `/patient/chatbot`: rule-based symptom collection assistant
- `/patient/book`: appointment booking form
- `/patient/records`: medical records and upload UI
- `/patient/result`: consultation result
- `/doctor`: doctor workload dashboard
- `/doctor/patients/:id`: patient detail
- `/doctor/consultation/:id`: consultation note form
- `/admin`: admin metrics and appointment table

## Data Flow

All data comes from local mock modules under `src/data`. Pages read static mock arrays and objects directly. Form interactions update local component state only to support demo behavior.

## Testing

Smoke tests verify that the app renders, route navigation works, and core pages expose the expected dashboard regions.
