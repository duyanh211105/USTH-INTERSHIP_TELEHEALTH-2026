import { apiRequest, buildUrl, storeSession } from './apiClient.js';

export async function login(email, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  storeSession(data);
  return data;
}

export function registerPatient(payload) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: payload,
  }).then((data) => data.user);
}

export function getMe() {
  return apiRequest('/auth/me');
}

function toQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value).trim());
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function getDoctors(params = {}) {
  return apiRequest(`/doctors${toQueryString(params)}`).then((data) => data.doctors || []);
}

export function getDoctorSlots(doctorId, date) {
  return apiRequest(`/doctors/${doctorId}/slots?date=${encodeURIComponent(date)}`).then((data) => data.slots || []);
}

export function getMyAvailability() {
  return apiRequest('/doctors/me/availability').then((data) => data.availability || []);
}

export function saveMyAvailability(availability) {
  return apiRequest('/doctors/me/availability', {
    method: 'PUT',
    body: { availability },
  }).then((data) => data.availability || []);
}

export function getMyUnavailability() {
  return apiRequest('/doctors/me/unavailability').then((data) => data.unavailability || []);
}

export function addMyUnavailability(payload) {
  return apiRequest('/doctors/me/unavailability', {
    method: 'POST',
    body: payload,
  }).then((data) => data.unavailability);
}

export function deleteMyUnavailability(id) {
  return apiRequest(`/doctors/me/unavailability/${id}`, {
    method: 'DELETE',
  });
}

export function getMyLeaveRequests() {
  return apiRequest('/leave-requests').then((data) => data.leaveRequests || []);
}

export function createLeaveRequest(payload) {
  return apiRequest('/leave-requests', {
    method: 'POST',
    body: payload,
  }).then((data) => data.leaveRequest);
}

export function getAppointments() {
  return apiRequest('/appointments').then((data) => data.appointments || []);
}

export function getAppointment(appointmentId) {
  return apiRequest(`/appointments/${appointmentId}`).then((data) => data.appointment);
}

export function getAppointmentCalendarUrl(appointmentId) {
  return buildUrl(`/appointments/${appointmentId}/calendar.ics`);
}

export function getAppointmentVideoRoom(appointmentId) {
  return apiRequest(`/appointments/${appointmentId}/video-room`);
}

export function createAppointment(payload) {
  return apiRequest('/appointments', {
    method: 'POST',
    body: payload,
  });
}

export function updateAppointmentStatus(appointmentId, status) {
  return apiRequest(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: { status },
  }).then((data) => data.appointment);
}

export function cancelAppointment(appointmentId, cancellationReason) {
  return apiRequest(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'CANCELLED', cancellationReason },
  }).then((data) => data.appointment);
}

export function getRecords() {
  return apiRequest('/records').then((data) => data.records || []);
}

export function getPatient(patientId) {
  return apiRequest(`/patients/${patientId}`).then((data) => data.patient);
}

export function createMedicalRecord(payload) {
  return apiRequest('/records', {
    method: 'POST',
    body: payload,
  }).then((data) => data.record);
}

export function uploadMedicalDocument(recordId, file) {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest(`/records/${recordId}/upload`, {
    method: 'POST',
    body: formData,
  }).then((data) => data.document);
}

export function deleteMedicalRecord(recordId) {
  return apiRequest(`/records/${recordId}`, {
    method: 'DELETE',
  });
}

export function createSymptomSummary(payload) {
  return apiRequest('/symptoms', {
    method: 'POST',
    body: payload,
  }).then((data) => data.symptom);
}

export function getSymptomsForPatient(patientId) {
  return apiRequest(`/symptoms/patient/${patientId}`).then((data) => data.symptoms || []);
}

export function getConsultations() {
  return apiRequest('/consultations').then((data) => data.consultations || []);
}

export function createConsultation(payload) {
  return apiRequest('/consultations', {
    method: 'POST',
    body: payload,
  }).then((data) => data.consultation);
}

export function getAdminSummary() {
  return apiRequest('/admin/summary').then((data) => data.summary);
}

export function getAdminDoctors() {
  return apiRequest('/admin/doctors').then((data) => data.doctors || []);
}

export function createAdminDoctor(payload) {
  return apiRequest('/admin/doctors', {
    method: 'POST',
    body: payload,
  }).then((data) => data.doctor);
}

export function updateAdminDoctor(doctorId, payload) {
  return apiRequest(`/admin/doctors/${doctorId}`, {
    method: 'PATCH',
    body: payload,
  }).then((data) => data.doctor);
}

export function deleteAdminDoctor(doctorId) {
  return apiRequest(`/admin/doctors/${doctorId}`, {
    method: 'DELETE',
  }).then((data) => data.doctor);
}

export function updateUserStatus(userId, status) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: { status },
  }).then((data) => data.user);
}

export function getAdminLeaveRequests() {
  return apiRequest('/admin/leave-requests').then((data) => data.leaveRequests || []);
}

export function getAdminAuditLogs(params = {}) {
  return apiRequest(`/admin/audit-logs${toQueryString(params)}`);
}

export function approveAdminLeaveRequest(id) {
  return apiRequest(`/admin/leave-requests/${id}/approve`, {
    method: 'POST',
  }).then((data) => data.leaveRequest);
}

export function rejectAdminLeaveRequest(id) {
  return apiRequest(`/admin/leave-requests/${id}/reject`, {
    method: 'POST',
  }).then((data) => data.leaveRequest);
}
