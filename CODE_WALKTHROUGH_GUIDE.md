# Code walkthrough guide - MediConnect

Mục tiêu của tài liệu này là map từng màn hình frontend với backend route, controller, service và database table liên quan để bạn giải thích dự án rõ ràng khi demo với supervisor.

## 1. Login và Patient Register

What to show on UI:
- `/login`: đăng nhập bằng patient, doctor hoặc admin.
- `/register`: bệnh nhân tạo tài khoản mới với full name, email, password, phone, national ID và permanent address.

Frontend files:
- `src/pages/LoginPage.jsx`
- `src/pages/RegisterPage.jsx`
- `src/services/apiClient.js`
- `src/services/telehealthApi.js`
- `src/App.jsx`

Backend files:
- `server/src/routes/authRoutes.js`
- `server/src/controllers/authController.js`
- `server/src/services/authService.js`
- `server/src/services/userService.js`
- `server/src/middleware/auth.js`

Database tables:
- `users`

Demo explanation:
> Login gọi `/auth/login`, backend so sánh password bằng bcrypt và trả JWT. Register tạo user role patient, validate email và national ID unique, sau đó patient có thể login như tài khoản thật.

## 2. Admin Doctor Management

What to show on UI:
- `/admin/doctors`: tạo doctor, sửa profile, deactivate, reactivate hoặc delete doctor.

Frontend files:
- `src/pages/admin/AdminDoctorManagementPage.jsx`
- `src/pages/admin/AdminDashboard.jsx`
- `src/services/telehealthApi.js`

Backend files:
- `server/src/routes/adminRoutes.js`
- `server/src/controllers/adminController.js`
- `server/src/services/adminService.js`
- `server/src/services/doctorService.js`
- `server/src/middleware/roles.js`

Database tables:
- `users`
- `doctor_profiles`
- `appointments`

Demo explanation:
> Admin là role duy nhất được tạo doctor. Khi tạo doctor, backend insert vào `users` với role doctor và insert profile vào `doctor_profiles`. Doctor inactive không hiện ở booking page.

## 3. Doctor Schedule Management

What to show on UI:
- `/doctor/schedule`: bác sĩ thêm, sửa, xóa session theo weekday.
- Thử tạo overlapping sessions để thấy validation.

Frontend files:
- `src/pages/doctor/DoctorSchedulePage.jsx`
- `src/components/Button.jsx`
- `src/components/Card.jsx`
- `src/components/StatusBadge.jsx`
- `src/hooks/useToast.js`
- `src/services/telehealthApi.js`

Backend files:
- `server/src/routes/doctorRoutes.js`
- `server/src/controllers/doctorController.js`
- `server/src/services/scheduleService.js`
- `server/src/middleware/roles.js`

Database tables:
- `doctor_schedules`
- `doctor_unavailability`
- `users`

Demo explanation:
> Schedule không còn là text input. Bác sĩ lưu các session theo weekday, ví dụ `08:00-11:00` và `13:00-17:00`. Backend validate giờ hợp lệ và không cho session overlap.

## 4. Leave Request Approval

What to show on UI:
- Doctor tạo leave request trong `/doctor/schedule`.
- Admin approve hoặc reject leave request.
- Patient booking page không hiện slot nếu leave đã approved.

Frontend files:
- `src/pages/doctor/DoctorSchedulePage.jsx`
- `src/pages/admin/AdminDoctorManagementPage.jsx`
- `src/services/telehealthApi.js`

Backend files:
- `server/src/routes/leaveRoutes.js`
- `server/src/routes/adminRoutes.js`
- `server/src/controllers/leaveController.js`
- `server/src/controllers/adminController.js`
- `server/src/services/leaveService.js`
- `server/src/services/scheduleService.js`

Database tables:
- `leave_requests`
- `doctor_schedules`
- `appointments`

Demo explanation:
> Bác sĩ chỉ gửi request. Admin approve thì ngày nghỉ mới block slot trong `generateSlots`. Nếu reject, slot booking vẫn bình thường.

## 5. Patient Symptom Chatbot

What to show on UI:
- `/patient/chatbot`: một chatbot duy nhất có hai mode.
- Symptom Assistant: thu thập triệu chứng.
- System Assistant: hỏi lịch bác sĩ, appointment status, upload help, booking help, cancellation help.

Frontend files:
- `src/pages/patient/ChatbotPage.jsx`
- `src/services/telehealthApi.js`
- `src/services/apiClient.js`

Backend files:
- `server/src/routes/symptomRoutes.js`
- `server/src/controllers/symptomController.js`
- `server/src/services/symptomService.js`
- `server/src/routes/doctorRoutes.js`
- `server/src/routes/appointmentRoutes.js`

Database tables:
- `symptom_summaries`
- `appointments`
- `doctor_schedules`
- `leave_requests`

Demo explanation:
> Chatbot dùng rule-based intent detection, không dùng AI API. Nó không chẩn đoán và không kê đơn. Symptom summary được lưu có cấu trúc, gồm priority và red flags để bác sĩ xem.

## 6. Appointment Booking

What to show on UI:
- `/patient/book`: chọn doctor, date và slot có sẵn.
- Submit appointment.
- Thử duplicate click để giải thích idempotency.

Frontend files:
- `src/pages/patient/BookAppointmentPage.jsx`
- `src/services/telehealthApi.js`
- `src/hooks/useToast.js`

Backend files:
- `server/src/routes/appointmentRoutes.js`
- `server/src/controllers/appointmentController.js`
- `server/src/services/appointmentService.js`
- `server/src/services/scheduleService.js`
- `server/src/routes/doctorRoutes.js`

Database tables:
- `appointments`
- `users`
- `doctor_profiles`
- `doctor_schedules`
- `leave_requests`

Demo explanation:
> Frontend chỉ hiển thị slot backend trả về. Backend kiểm tra slot lần nữa, khóa slot khi appointment pending/confirmed/completed và xử lý duplicate request trong 5 giây.

## 7. Medical Record Upload

What to show on UI:
- `/patient/records`: tạo record, choose file, upload PDF/JPG/PNG.
- Preview image hoặc open/download PDF.
- Patient delete uploaded record.

Frontend files:
- `src/pages/patient/MedicalRecordsPage.jsx`
- `src/services/telehealthApi.js`
- `src/services/apiClient.js`
- `src/components/EmptyState.jsx`

Backend files:
- `server/src/routes/recordRoutes.js`
- `server/src/controllers/recordController.js`
- `server/src/services/recordService.js`
- `server/src/services/storageService.js`
- `server/src/middleware/upload.js`
- `server/src/middleware/ownership.js`

Database tables:
- `medical_records`
- `medical_documents`
- `users`
- `appointments`

Demo explanation:
> File upload dùng multipart/form-data. Backend validate MIME type và extension, giới hạn 10MB, lưu metadata vào database và file vào local storage adapter.

## 8. Doctor Dashboard

What to show on UI:
- `/doctor`: danh sách appointments của doctor đang login.
- Patient name link đến patient detail.
- Write Note link đến consultation page.
- Confirm hoặc cancel appointment.

Frontend files:
- `src/pages/doctor/DoctorDashboard.jsx`
- `src/layouts/DashboardLayout.jsx`
- `src/components/DataTable.jsx`
- `src/services/telehealthApi.js`

Backend files:
- `server/src/routes/appointmentRoutes.js`
- `server/src/controllers/appointmentController.js`
- `server/src/services/appointmentService.js`

Database tables:
- `appointments`
- `users`

Demo explanation:
> Dashboard bác sĩ không dùng hardcoded patient. Backend filter appointments theo doctorId từ JWT.

## 9. Doctor Patient Detail

What to show on UI:
- `/doctor/patients/:patientId`: refresh vẫn load đúng patient.
- Xem appointments, symptom summaries, red flags và medical records.

Frontend files:
- `src/pages/doctor/PatientDetailPage.jsx`
- `src/services/telehealthApi.js`
- `src/services/apiClient.js`

Backend files:
- `server/src/routes/patientRoutes.js`
- `server/src/controllers/patientController.js`
- `server/src/services/patientService.js`
- `server/src/routes/recordRoutes.js`
- `server/src/services/recordService.js`
- `server/src/routes/symptomRoutes.js`
- `server/src/services/symptomService.js`
- `server/src/middleware/ownership.js`

Database tables:
- `users`
- `appointments`
- `medical_records`
- `medical_documents`
- `symptom_summaries`

Demo explanation:
> Page đọc `patientId` từ route param và fetch backend, không phụ thuộc state tạm thời. Bác sĩ chỉ xem patient có appointment với mình.

## 10. Doctor Consultation Note

What to show on UI:
- `/doctor/consultation/:appointmentId`: load appointment context thật.
- Save consultation note.
- Sau save, appointment thành completed.

Frontend files:
- `src/pages/doctor/ConsultationNotePage.jsx`
- `src/services/telehealthApi.js`
- `src/hooks/useToast.js`

Backend files:
- `server/src/routes/consultationRoutes.js`
- `server/src/controllers/consultationController.js`
- `server/src/services/consultationService.js`
- `server/src/routes/appointmentRoutes.js`
- `server/src/services/appointmentService.js`

Database tables:
- `consultation_notes`
- `appointments`
- `users`

Demo explanation:
> Consultation note gắn với appointmentId. Backend đảm bảo doctor chỉ viết note cho appointment được phân công. Save thành công sẽ tạo consultation note và update appointment status thành completed.

## 11. Patient Consultation Result

What to show on UI:
- `/patient/result`: patient xem consultation results của mình.

Frontend files:
- `src/pages/patient/ConsultationResultPage.jsx`
- `src/services/telehealthApi.js`

Backend files:
- `server/src/routes/consultationRoutes.js`
- `server/src/controllers/consultationController.js`
- `server/src/services/consultationService.js`

Database tables:
- `consultation_notes`
- `appointments`
- `users`

Demo explanation:
> Patient result không lấy tất cả consultation notes. Backend filter theo patient id từ JWT.

## 12. Role-based Authorization

Files to open:
- `server/src/middleware/auth.js`
- `server/src/middleware/roles.js`
- `server/src/middleware/ownership.js`

Explanation:
> `requireAuth` verify JWT và gán `req.user`. `requireRole` chặn sai role. Ownership middleware và service logic đảm bảo patient chỉ xem dữ liệu của mình, doctor chỉ xem patient/appointment được phân công, admin có quyền quản trị.

Important cases:
- Missing token: `401 Unauthorized`.
- Wrong role: `403 Forbidden`.
- Missing resource: `404 Not Found`.
- Inactive account: bị chặn login/API access.

## 13. File Upload Security

Files to open:
- `server/src/middleware/upload.js`
- `server/src/services/storageService.js`
- `server/src/services/recordService.js`

Explanation:
> Multer nhận file, storage service validate extension và MIME type, chỉ cho PDF/JPG/PNG và giới hạn 10MB. File được lưu local, metadata lưu trong `medical_documents`. Adapter hiện tại có thể thay bằng Firebase Storage mà ít ảnh hưởng controller.

## 14. Database Structure

Files to open:
- `server/src/db/schema.js`
- `server/src/db/seed.js`
- `DATABASE_ERD.md`

Important tables:
- `users`: tài khoản và role.
- `doctor_profiles`: thông tin chuyên môn của doctor.
- `appointments`: quan hệ patient-doctor theo ngày/giờ.
- `doctor_schedules`: lịch làm việc có cấu trúc.
- `leave_requests`: quy trình nghỉ phép doctor-admin.
- `medical_records` và `medical_documents`: hồ sơ và file upload.
- `symptom_summaries`: thông tin chatbot.
- `consultation_notes`: kết quả tư vấn.

Demo explanation:
> Database xoay quanh `users`. Patient, doctor và admin nằm trong cùng bảng users với role khác nhau. Appointment là bảng trung tâm kết nối patient và doctor, từ đó mở ra records, symptoms và consultation notes theo ownership.

## 15. Suggested file opening order

1. `src/App.jsx`
2. `src/services/telehealthApi.js`
3. `server/src/app.js`
4. `server/src/db/schema.js`
5. `server/src/middleware/auth.js`
6. `server/src/middleware/ownership.js`
7. Frontend page của feature.
8. Matching backend route.
9. Matching controller.
10. Matching service.
