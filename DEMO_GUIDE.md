# Hướng dẫn demo dự án MediConnect

## 1. Demo overview

MediConnect là hệ thống telehealth MVP cho ba nhóm người dùng: bệnh nhân, bác sĩ và admin. Hệ thống mô phỏng quy trình tư vấn sức khỏe từ xa từ lúc bệnh nhân đăng ký, khai báo triệu chứng, đặt lịch, tham gia video consultation nhẹ bằng Jitsi Meet cho lịch đã xác nhận, tải hồ sơ y tế, đến lúc bác sĩ xem thông tin, viết ghi chú tư vấn và bệnh nhân nhận kết quả.

Thông điệp chính:
- Bệnh nhân có thể tự đăng ký tài khoản thật.
- Admin tạo và quản lý bác sĩ.
- Bác sĩ cấu hình lịch làm việc theo slot.
- Bệnh nhân chỉ đặt được slot còn trống.
- Bệnh nhân và bác sĩ có thể join video consultation khi appointment đã được xác nhận và đang trong khung giờ cho phép.
- Backend kiểm tra JWT, role và ownership.
- Chatbot chỉ thu thập triệu chứng và hỗ trợ thao tác hệ thống, không chẩn đoán và không kê đơn.

## 2. Chuẩn bị trước demo

Seed database:

```powershell
npm.cmd run seed --prefix server
```

Chạy backend:

```powershell
npm.cmd run dev --prefix server
```

Chạy frontend:

```powershell
npm.cmd run dev
```

Mở ứng dụng:

```text
http://localhost:5173
```

Demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Patient | `patient@example.com` | `password123` |
| Doctor | `doctor@example.com` | `password123` |
| Admin | `admin@example.com` | `password123` |

## 3. Demo flow từng bước

### Bước 1: Patient registration và login

UI cần show:
- Mở `/login`.
- Bấm link register.
- Nhập `full_name`, `email`, `password`, `phone`, `national_id`, `permanent_address`.
- Tạo tài khoản và đăng nhập.

Câu nói mẫu:
> Bệnh nhân có thể tự tạo tài khoản thật. Email và national ID được validate unique, password được hash bằng bcrypt và password hash không bao giờ trả về frontend.

### Bước 2: Admin tạo doctor

UI cần show:
- Đăng nhập bằng `admin@example.com`.
- Vào `/admin/doctors`.
- Tạo doctor với name, email, password, specialty, phone, bio và consultation fee.
- Xem doctor mới trong danh sách.

Câu nói mẫu:
> Bác sĩ không phải mock data. Admin tạo doctor sẽ ghi vào bảng `users` với role doctor và bảng `doctor_profiles`.

### Bước 3: Doctor cấu hình schedule

UI cần show:
- Đăng nhập bằng doctor.
- Vào `/doctor/schedule`.
- Thêm session theo weekday, ví dụ `08:00-11:00` và `13:00-17:00`.
- Lưu schedule.
- Thử tạo session overlap để thấy validation.

Câu nói mẫu:
> Lịch bác sĩ được quản lý có cấu trúc theo ngày trong tuần và nhiều ca làm việc trong một ngày. Backend chặn session bị trùng và yêu cầu end time phải sau start time.

### Bước 4: Doctor gửi leave request

UI cần show:
- Trong `/doctor/schedule`, tạo leave request với date, reason và note.
- Leave request có status `PENDING`.

Câu nói mẫu:
> Bác sĩ chỉ gửi yêu cầu nghỉ. Ngày nghỉ chỉ chặn slot booking sau khi admin approve.

### Bước 5: Admin approve hoặc reject leave

UI cần show:
- Đăng nhập admin.
- Mở phần quản lý leave requests.
- Approve hoặc reject request.
- Quay lại booking để kiểm tra approved leave làm mất slot ngày đó.

Câu nói mẫu:
> Admin là người quyết định leave request. Chỉ leave request đã approved mới ảnh hưởng đến slot booking.

### Bước 6: Patient dùng chatbot

UI cần show:
- Đăng nhập patient.
- Vào `/patient/chatbot`.
- Bấm quick action `Report symptoms`.
- Nhập main symptom, duration, fever, medication, allergies và history.
- Nếu nhập fever, headache, chest pain hoặc stomach pain, chatbot hỏi thêm câu follow-up.
- Xem structured summary, priority và nút Book Appointment.

Câu nói mẫu:
> Chatbot là rule-based healthcare assistant. Nó không dùng AI API, không chẩn đoán và không kê đơn. Nó chỉ thu thập thông tin có cấu trúc để bác sĩ xem.

### Bước 7: Patient đặt appointment

UI cần show:
- Vào `/patient/book`.
- Chọn doctor active.
- Chọn date.
- Hệ thống load available slots từ backend.
- Chọn slot và tạo appointment.
- Thử bấm nhiều lần để giải thích duplicate protection.

Câu nói mẫu:
> Slot được sinh từ schedule của doctor, trừ lịch nghỉ đã approved và các appointment đang pending, confirmed hoặc completed. Backend có idempotency để tránh tạo trùng lịch khi người dùng bấm nhiều lần.

### Bước 8: Patient và doctor join video consultation

UI cần show:
- Doctor hoặc admin confirm appointment.
- Patient mở dashboard hoặc `/patient/result`.
- Doctor mở `/doctor/consultation/:appointmentId`.
- Khi appointment là `CONFIRMED`, hệ thống hiển thị nút Join Video Call.
- Nút chỉ enable từ 15 phút trước giờ hẹn đến khi appointment kết thúc.

Câu nói mẫu:
> Video call trong MVP dùng external Jitsi Meet room link, không xây custom WebRTC hoặc signaling server. Backend chỉ cho assigned patient và assigned doctor lấy room URL của appointment đã confirmed, và có kiểm tra khung giờ truy cập.

### Bước 9: Patient upload medical records

UI cần show:
- Vào `/patient/records`.
- Tạo medical record.
- Bấm Choose File.
- Chọn PDF, JPG hoặc PNG.
- Upload và xem tên file, preview image hoặc open PDF.

Câu nói mẫu:
> File upload dùng multipart/form-data. Backend validate MIME type, extension và giới hạn 10MB. Metadata được lưu trong database, file được lưu local qua storage adapter.

### Bước 10: Doctor xem assigned patient

UI cần show:
- Đăng nhập doctor.
- Vào `/doctor`.
- Bấm tên patient trong appointment.
- Mở `/doctor/patients/:patientId`.
- Xem symptom summary, priority, red flags, appointments và medical records.

Câu nói mẫu:
> Route patient detail dùng patientId thật. Nếu refresh trang, page vẫn fetch lại backend. Bác sĩ chỉ xem patient có appointment với mình.

### Bước 11: Doctor mở uploaded file

UI cần show:
- Trong patient detail, mở uploaded file.
- Image có thể preview, PDF có thể open/download.

Câu nói mẫu:
> Doctor có thể xem file bệnh nhân upload nếu có quyền với bệnh nhân đó. Backend ownership check chặn doctor xem hồ sơ của patient không liên quan.

### Bước 12: Doctor viết consultation note

UI cần show:
- Từ dashboard hoặc patient detail, bấm Write Note.
- Mở `/doctor/consultation/:appointmentId`.
- Nhập symptoms, diagnosis, prescription, advice, follow-up.
- Save note.

Câu nói mẫu:
> Consultation note liên kết với appointmentId. Bác sĩ chỉ viết note cho appointment được phân công. Sau khi save, appointment được mark completed.

### Bước 13: Patient xem consultation result

UI cần show:
- Đăng nhập patient.
- Vào `/patient/result`.
- Xem consultation note của mình.

Câu nói mẫu:
> Bệnh nhân chỉ xem kết quả tư vấn của chính mình. Backend filter theo user trong JWT.

## 4. Key technical talking points

JWT authentication:
> Sau khi login, backend trả JWT. Frontend lưu token và gửi `Authorization: Bearer <token>` cho protected APIs.

Role-based authorization:
> Admin, doctor và patient có quyền khác nhau. Backend dùng middleware để chặn sai role, không chỉ dựa vào frontend.

Ownership checks:
> Patient chỉ truy cập dữ liệu của mình. Doctor chỉ truy cập appointment, patient và record được phân công. Admin có quyền quản trị.

Doctor scheduling:
> Slot không hardcode. Slot được sinh từ `doctor_schedules`, sau đó loại bỏ slot đã bị appointment lock hoặc leave request approved.

Duplicate booking prevention:
> Frontend disable nút khi submit. Backend vẫn có idempotency và slot locking để bảo vệ nếu request bị gửi nhiều lần.

File upload security:
> Backend chỉ nhận PDF, JPG, PNG, giới hạn 10MB và chặn extension nguy hiểm như `.exe`, `.sh`, `.bat`, `.js`.

Video consultation:
> Video consultation là lightweight MVP bằng Jitsi Meet room link. Room chỉ được tạo khi appointment chuyển sang confirmed, chỉ assigned patient và doctor được lấy link, và nút join chỉ mở trong khung 15 phút trước giờ hẹn đến khi appointment kết thúc.

Chatbot:
> Chatbot chỉ thu thập triệu chứng và hỗ trợ điều hướng hệ thống. Red flags chỉ đánh dấu priority cao, không phải chẩn đoán.

## 5. Code walkthrough mapping nhanh

| Feature | Frontend | Backend | Tables |
| --- | --- | --- | --- |
| Login/Register | `src/pages/LoginPage.jsx`, `src/pages/RegisterPage.jsx` | `authRoutes.js`, `authController.js`, `authService.js` | `users` |
| Admin doctor management | `src/pages/admin/AdminDoctorManagementPage.jsx` | `adminRoutes.js`, `adminController.js`, `adminService.js` | `users`, `doctor_profiles` |
| Doctor schedule | `src/pages/doctor/DoctorSchedulePage.jsx` | `doctorRoutes.js`, `doctorController.js`, `scheduleService.js` | `doctor_schedules`, `doctor_unavailability` |
| Leave approval | `DoctorSchedulePage.jsx`, `AdminDoctorManagementPage.jsx` | `leaveRoutes.js`, `adminRoutes.js`, `leaveService.js` | `leave_requests` |
| Chatbot | `src/pages/patient/ChatbotPage.jsx` | `symptomRoutes.js`, `symptomController.js`, `symptomService.js` | `symptom_summaries` |
| Booking | `src/pages/patient/BookAppointmentPage.jsx` | `appointmentRoutes.js`, `appointmentController.js`, `appointmentService.js` | `appointments`, `doctor_schedules`, `leave_requests` |
| Video consultation | `src/components/VideoCallButton.jsx`, `src/pages/patient/PatientDashboard.jsx`, `src/pages/patient/ConsultationResultPage.jsx`, `src/pages/doctor/ConsultationNotePage.jsx` | `appointmentRoutes.js`, `appointmentController.js`, `appointmentService.js` | `appointments`, `audit_logs` |
| Records | `src/pages/patient/MedicalRecordsPage.jsx` | `recordRoutes.js`, `recordController.js`, `recordService.js` | `medical_records`, `medical_documents` |
| Doctor patient detail | `src/pages/doctor/PatientDetailPage.jsx` | `patientRoutes.js`, `recordRoutes.js`, `symptomRoutes.js` | `users`, `appointments`, `medical_records`, `symptom_summaries` |
| Consultation note | `src/pages/doctor/ConsultationNotePage.jsx` | `consultationRoutes.js`, `consultationController.js`, `consultationService.js` | `consultation_notes`, `appointments` |
| Patient result | `src/pages/patient/ConsultationResultPage.jsx` | `consultationRoutes.js`, `consultationController.js`, `consultationService.js` | `consultation_notes` |

## 6. Test commands

```powershell
npm.cmd run test
npm.cmd run test --prefix server
npm.cmd run build
```

## 7. Limitations và future improvements

Limitations:
- Medical files mặc định được lưu local nếu chưa cấu hình Firebase Storage.
- SQLite đang được dùng cho MVP và local development.
- Video consultation hiện ở mức lightweight Jitsi Meet external room link cho confirmed appointments, chưa phải hạ tầng video call tự xây.
- Chatbot không chẩn đoán và không kê đơn.
- Chưa có email/SMS notification.
- Chưa có payment workflow.
- Chưa có custom WebRTC infrastructure, signaling server, call recording, screen sharing hoặc real-time transcription.

Future improvements:
- Firebase Storage hardening: Firebase Storage đã có adapter optional; về sau có thể thêm signed URL expiry, malware scanning và lifecycle policies.
- Doctor search by specialty: có thể mở rộng search bằng ranking, rating, ngôn ngữ và specialty taxonomy.
- Calendar integration: hiện tại có `.ics` export; về sau có thể thêm Google Calendar OAuth sync hai chiều.
- Audit logs: hiện tại có admin audit logs; về sau có thể thêm CSV export, retention policy, anomaly alerts và correlation ID.
- Video consultation: hiện tại in-scope là lightweight teleconsultation dùng external room integration cho confirmed appointments; về sau có thể thêm provider abstraction, meeting sync nâng cao hoặc hạ tầng realtime riêng nếu cần.
