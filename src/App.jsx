import { Navigate, Route, Routes } from 'react-router-dom';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage.jsx';
import AdminDoctorManagementPage from './pages/admin/AdminDoctorManagementPage.jsx';
import ConsultationNotePage from './pages/doctor/ConsultationNotePage.jsx';
import DoctorDashboard from './pages/doctor/DoctorDashboard.jsx';
import DoctorSchedulePage from './pages/doctor/DoctorSchedulePage.jsx';
import PatientDetailPage from './pages/doctor/PatientDetailPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import BookAppointmentPage from './pages/patient/BookAppointmentPage.jsx';
import ChatbotPage from './pages/patient/ChatbotPage.jsx';
import ConsultationResultPage from './pages/patient/ConsultationResultPage.jsx';
import MedicalRecordsPage from './pages/patient/MedicalRecordsPage.jsx';
import PatientDashboard from './pages/patient/PatientDashboard.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/patient" element={<PatientDashboard />} />
      <Route path="/patient/chatbot" element={<ChatbotPage />} />
      <Route path="/patient/book" element={<BookAppointmentPage />} />
      <Route path="/patient/records" element={<MedicalRecordsPage />} />
      <Route path="/patient/result" element={<ConsultationResultPage />} />
      <Route path="/doctor" element={<DoctorDashboard />} />
      <Route path="/doctor/schedule" element={<DoctorSchedulePage />} />
      <Route path="/doctor/patients/:patientId" element={<PatientDetailPage />} />
      <Route path="/doctor/consultation/:appointmentId" element={<ConsultationNotePage />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/doctors" element={<AdminDoctorManagementPage />} />
      <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
