import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import App from '../App.jsx';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function renderRoute(route) {
  window.history.pushState({}, 'Test route', route);

  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

const apiDoctors = [
  {
    id: 2,
    name: 'Dr. API Heart',
    specialty: 'Cardiology',
    phone: '0912345678',
    status: 'ACTIVE',
    availability: 'Today, 11:00 AM',
    availabilitySummary: 'Today, 11:00 AM',
    consultationFee: 35,
    rating: 4.9,
    patientsCount: 1200,
  },
];

const apiAdminDoctors = [
  ...apiDoctors,
  {
    id: 7,
    name: 'Dr. Admin Skin',
    email: 'skin@example.com',
    specialty: 'Dermatology',
    phone: '0987654321',
    status: 'ACTIVE',
    availability: 'Weekdays',
    availabilitySummary: 'Weekdays',
    consultationFee: 45,
  },
];

const apiLeaveRequests = [
  {
    id: 31,
    doctorId: 2,
    doctorName: 'Dr. API Heart',
    date: '2026-05-19',
    reason: 'Family leave',
    note: 'School event',
    status: 'PENDING',
  },
];

const apiAuditLogs = [
  {
    id: 501,
    actorUserId: 3,
    actorName: 'admin user',
    actorRole: 'admin',
    action: 'doctor.created',
    entityType: 'doctor',
    entityId: 22,
    metadata: { email: 'created-doctor@example.com' },
    createdAt: '2026-05-16T08:00:00.000Z',
  },
  {
    id: 500,
    actorUserId: 1,
    actorName: 'patient user',
    actorRole: 'patient',
    action: 'appointment.created',
    entityType: 'appointment',
    entityId: 10,
    metadata: { scheduledDate: '2026-05-07', scheduledTime: '10:30' },
    createdAt: '2026-05-16T07:45:00.000Z',
  },
];

function appointmentPartsFromNow(offsetMinutes) {
  const value = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');

  return {
    scheduledDate: `${year}-${month}-${day}`,
    scheduledTime: `${hours}:${minutes}`,
  };
}

const apiAppointments = [
  {
    id: 10,
    patientId: 1,
    doctorId: 2,
    patientName: 'Ava Nguyen',
    doctorName: 'Dr. API Heart',
    scheduledDate: '2026-05-07',
    scheduledTime: '10:30',
    reason: 'Headache and mild fever for 2 days',
    status: 'PENDING',
  },
  {
    id: 14,
    patientId: 4,
    doctorId: 2,
    patientName: 'Minh Tran',
    doctorName: 'Dr. API Heart',
    scheduledDate: '2026-05-08',
    scheduledTime: '14:00',
    reason: 'Chest tightness and fatigue',
    status: 'PENDING',
  },
  {
    id: 15,
    patientId: 6,
    doctorId: 2,
    patientName: 'Empty Patient',
    doctorName: 'Dr. API Heart',
    scheduledDate: '2026-05-09',
    scheduledTime: '15:00',
    reason: 'New intake appointment',
    status: 'PENDING',
  },
];

const apiRecords = [
  {
    id: 20,
    patientId: 1,
    patientName: 'Ava Nguyen',
    title: 'API Blood Test',
    category: 'Laboratory',
    createdAt: '2026-04-28T10:00:00.000Z',
    documents: [
      {
        id: 60,
        recordId: 20,
        originalName: 'chest-xray.png',
        mimeType: 'image/png',
        url: '/uploads/chest-xray.png',
      },
      {
        id: 61,
        recordId: 20,
        originalName: 'blood-test.pdf',
        mimeType: 'application/pdf',
        url: '/uploads/blood-test.pdf',
      },
    ],
  },
  {
    id: 21,
    patientId: 4,
    patientName: 'Minh Tran',
    title: 'Minh Cardiology Intake',
    category: 'Cardiology',
    createdAt: '2026-05-01T10:00:00.000Z',
    documents: [],
  },
];

let apiConsultationsResponse = [];
let apiSymptomsByPatient = {};

const apiPatients = {
  1: {
    id: 1,
    name: 'Ava Nguyen',
    email: 'jane@example.com',
    phone: '0900000001',
    permanentAddress: '123 Main Street',
    role: 'patient',
    status: 'ACTIVE',
  },
  4: {
    id: 4,
    name: 'Minh Tran',
    email: 'minh@example.com',
    phone: '0900000004',
    permanentAddress: '456 Nguyen Hue',
    role: 'patient',
    status: 'ACTIVE',
  },
  6: {
    id: 6,
    name: 'Empty Patient',
    email: 'empty@example.com',
    phone: '0900000006',
    permanentAddress: '789 Le Loi',
    role: 'patient',
    status: 'ACTIVE',
  },
};

function mockApiResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ success: status >= 200 && status < 300, data }),
  });
}

function mockApiError(message, status) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, error: { message } }),
  });
}

describe('Telehealth frontend routes', () => {
  beforeEach(() => {
    localStorage.clear();
    apiConsultationsResponse = [];
    apiSymptomsByPatient = {};
    global.fetch = vi.fn((input, options = {}) => {
      const url = String(input);
      const pathname = new URL(url, 'http://localhost:4000').pathname;
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const body = options.body && !isFormData ? JSON.parse(options.body) : {};

      if (pathname === '/auth/login') {
        const role = body.email.startsWith('doctor')
          ? 'doctor'
          : body.email.startsWith('admin')
            ? 'admin'
            : 'patient';

        return mockApiResponse({
          token: `test-token-${role}`,
          user: { id: role === 'doctor' ? 2 : role === 'admin' ? 3 : 1, name: `${role} user`, email: body.email, role },
        });
      }

      if (pathname === '/auth/register') {
        if (body.email === 'duplicate@example.com') {
          return mockApiResponse({ message: 'email is already registered' }, 409);
        }

        return mockApiResponse({
          user: {
            id: 21,
            name: body.full_name,
            email: body.email,
            phone: body.phone,
            nationalId: body.national_id,
            permanentAddress: body.permanent_address,
            role: 'patient',
            status: 'ACTIVE',
          },
        }, 201);
      }

      if (pathname === '/doctors') {
        const params = new URL(url, 'http://localhost:4000').searchParams;
        const specialty = params.get('specialty');
        const q = params.get('q');
        const maxFee = params.get('maxFee');
        const filteredDoctors = apiDoctors.filter((doctor) => {
          if (specialty && !doctor.specialty.toLowerCase().includes(specialty.toLowerCase())) {
            return false;
          }

          if (q && !doctor.name.toLowerCase().includes(q.toLowerCase())) {
            return false;
          }

          if (maxFee && Number(doctor.consultationFee) > Number(maxFee)) {
            return false;
          }

          return true;
        });

        if (specialty || q || maxFee || params.get('date')) {
          return mockApiResponse({ doctors: filteredDoctors });
        }

        return mockApiResponse({ doctors: apiDoctors });
      }

      if (pathname === '/doctors/2/slots') {
        const date = new URL(url, 'http://localhost:4000').searchParams.get('date');

        if (date === '2026-05-19') {
          return mockApiResponse({ slots: [] });
        }

        return mockApiResponse({
          slots: [
            { time: '09:00', startsAt: '2026-05-07T09:00:00.000Z', endsAt: '2026-05-07T09:30:00.000Z' },
            { time: '09:30', startsAt: '2026-05-07T09:30:00.000Z', endsAt: '2026-05-07T10:00:00.000Z' },
          ],
        });
      }

      if (pathname === '/doctors/me/availability') {
        if (options.method === 'PUT') {
          return mockApiResponse({ availability: body.availability });
        }

        return mockApiResponse({
          availability: [
            { id: 101, weekday: 1, startTime: '09:00', endTime: '11:00', slotDuration: 30 },
            { id: 102, weekday: 1, startTime: '13:00', endTime: '17:00', slotDuration: 30 },
            { weekday: 2, startTime: '09:00', endTime: '17:00', slotDuration: 30 },
          ],
        });
      }

      if (pathname === '/leave-requests') {
        if (options.method === 'POST') {
          return mockApiResponse({
            leaveRequest: {
              id: 32,
              doctorId: 2,
              doctorName: 'Dr. API Heart',
              status: 'PENDING',
              ...body,
            },
          }, 201);
        }

        return mockApiResponse({ leaveRequests: apiLeaveRequests });
      }

      if (pathname === '/doctors/me/unavailability') {
        return mockApiResponse({ unavailability: [] });
      }

      if (pathname === '/appointments') {
        if (options.method === 'POST') {
          if (body.scheduledTime === '09:30') {
            return mockApiResponse({ appointment: { ...apiAppointments[0], ...body, id: 12, status: 'PENDING' }, duplicate: true });
          }

          return mockApiResponse({ appointment: { ...apiAppointments[0], ...body, id: 11, status: 'PENDING' } }, 201);
        }

        return mockApiResponse({ appointments: apiAppointments });
      }

      const appointmentVideoMatch = pathname.match(/^\/appointments\/(\d+)\/video-room$/);
      if (appointmentVideoMatch) {
        const appointmentId = Number(appointmentVideoMatch[1]);
        const appointment = apiAppointments.find((item) => Number(item.id) === appointmentId);

        if (!appointment) {
          return mockApiError('Appointment not found', 404);
        }

        return mockApiResponse({
          appointmentId,
          provider: 'jitsi',
          videoRoomUrl: `https://meet.jit.si/mediconnect-appointment-${appointmentId}`,
          availableFrom: `${appointment.scheduledDate}T${appointment.scheduledTime}:00.000Z`,
          availableUntil: `${appointment.scheduledDate}T${appointment.scheduledTime}:00.000Z`,
        });
      }

      const appointmentMatch = pathname.match(/^\/appointments\/(\d+)$/);
      if (appointmentMatch) {
        if (Number(appointmentMatch[1]) === 18) {
          return mockApiError('Forbidden', 403);
        }

        const appointment = apiAppointments.find((item) => Number(item.id) === Number(appointmentMatch[1]));

        if (!appointment) {
          return mockApiError('Appointment not found', 404);
        }

        return mockApiResponse({ appointment });
      }

      if (pathname === '/appointments/10/status') {
        return mockApiResponse({
          appointment: {
            ...apiAppointments[0],
            status: body.status,
            cancellationReason: body.cancellationReason,
            cancelledBy: 2,
          },
        });
      }

      const patientMatch = pathname.match(/^\/patients\/(\d+)$/);
      if (patientMatch) {
        if (Number(patientMatch[1]) === 8) {
          return mockApiError('Forbidden', 403);
        }

        const patient = apiPatients[Number(patientMatch[1])];

        if (!patient) {
          return mockApiError('Patient not found', 404);
        }

        return mockApiResponse({ patient });
      }

      if (pathname === '/records') {
        if (options.method === 'POST') {
          return mockApiResponse({ record: { id: 50, ...body } }, 201);
        }

        return mockApiResponse({ records: apiRecords });
      }

      if (pathname === '/records/50/upload') {
        return mockApiResponse({
          document: {
            id: 60,
            recordId: 50,
            originalName: 'lab-result.pdf',
            mimeType: 'application/pdf',
            url: '/uploads/lab-result.pdf',
          },
        }, 201);
      }

      if (pathname === '/records/50' && options.method === 'DELETE') {
        return mockApiResponse({ deleted: true });
      }

      if (pathname === '/symptoms') {
        return mockApiResponse({ symptom: { id: 30, ...body } }, 201);
      }

      if (pathname.startsWith('/symptoms/patient/')) {
        const patientIdFromPath = pathname.split('/').pop();
        return mockApiResponse({ symptoms: apiSymptomsByPatient[patientIdFromPath] || [] });
      }

      if (pathname === '/consultations') {
        if (options.method === 'POST') {
          return mockApiResponse({ consultation: { id: 40, ...body } }, 201);
        }

        return mockApiResponse({ consultations: apiConsultationsResponse });
      }

      if (pathname === '/admin/summary') {
        return mockApiResponse({
          summary: {
            totalUsers: 6,
            totalDoctors: 2,
            totalPatients: 3,
            totalAppointments: 4,
            completedAppointments: 1,
          },
        });
      }

      if (pathname === '/admin/audit-logs') {
        const params = new URL(url, 'http://localhost:4000').searchParams;
        const action = params.get('action');
        const actorRole = params.get('actorRole');
        const page = Number(params.get('page') || 1);
        const limit = Number(params.get('limit') || 50);
        const logs = apiAuditLogs.filter((log) => {
          if (action && !log.action.includes(action)) {
            return false;
          }

          if (actorRole && log.actorRole !== actorRole) {
            return false;
          }

          return true;
        });

        return mockApiResponse({
          logs: logs.slice((page - 1) * limit, page * limit),
          pagination: {
            page,
            limit,
            total: logs.length,
            totalPages: Math.max(Math.ceil(logs.length / limit), 1),
          },
        });
      }

      if (pathname === '/admin/doctors') {
        if (options.method === 'POST') {
          return mockApiResponse({
            doctor: {
              id: 22,
              name: body.full_name,
              email: body.email,
              role: 'doctor',
              status: 'ACTIVE',
              specialty: body.specialty,
              phone: body.phone,
              bio: body.bio,
              availabilitySummary: body.availability_summary,
              consultationFee: body.consultation_fee,
            },
          }, 201);
        }

        return mockApiResponse({ doctors: apiAdminDoctors });
      }

      if (pathname === '/admin/leave-requests') {
        return mockApiResponse({ leaveRequests: apiLeaveRequests });
      }

      if (pathname === '/admin/leave-requests/31/approve') {
        return mockApiResponse({ leaveRequest: { ...apiLeaveRequests[0], status: 'APPROVED' } });
      }

      if (pathname === '/admin/leave-requests/31/reject') {
        return mockApiResponse({ leaveRequest: { ...apiLeaveRequests[0], status: 'REJECTED' } });
      }

      if (pathname === '/admin/users/7/status') {
        return mockApiResponse({ user: { id: 7, status: body.status } });
      }

      if (pathname === '/admin/doctors/7' && options.method === 'DELETE') {
        return mockApiResponse({ doctor: { ...apiAdminDoctors[1], status: 'DELETED' } });
      }

      if (pathname === '/admin/doctors/7') {
        return mockApiResponse({ doctor: { ...apiAdminDoctors[1], specialty: body.specialty || apiAdminDoctors[1].specialty } });
      }

      return mockApiResponse({});
    });
  });

  it('does not import legacy mock data from runtime frontend code', () => {
    function collectSourceFiles(directory) {
      return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'test') {
            return [];
          }

          return collectSourceFiles(fullPath);
        }

        return /\.(jsx|js)$/.test(entry.name) ? [fullPath] : [];
      });
    }

    const offenders = collectSourceFiles(path.join(projectRoot, 'src'))
      .filter((file) => path.basename(file) !== 'mockData.js')
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return source.includes('/data/mockData.js') || source.includes('mockData.js');
      })
      .map((file) => path.relative(projectRoot, file));

    expect(offenders).toEqual([]);
  });

  it('keeps shared UI components polished for interaction and responsive tables', () => {
    const buttonSource = fs.readFileSync(path.join(projectRoot, 'src/components/Button.jsx'), 'utf8');
    const tableSource = fs.readFileSync(path.join(projectRoot, 'src/components/DataTable.jsx'), 'utf8');
    const layoutSource = fs.readFileSync(path.join(projectRoot, 'src/layouts/DashboardLayout.jsx'), 'utf8');

    expect(buttonSource).toContain('transition-all');
    expect(buttonSource).toContain('hover:-translate-y-0.5');
    expect(buttonSource).toContain('focus-visible:ring-2');
    expect(tableSource).toContain('min-w-[720px]');
    expect(tableSource).toContain('hover:bg-medical-50/40');
    expect(tableSource).toContain('shadow-sm');
    expect(layoutSource).toContain('focus-visible:ring-2');
    expect(layoutSource).toContain('hover:-translate-y-0.5');
  });

  it('renders the login demo role screen', () => {
    renderRoute('/login');

    expect(screen.getByRole('heading', { name: /telehealth consultation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /patient demo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /doctor demo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /admin demo/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create patient account/i })).toHaveAttribute('href', '/register');
  });

  it('registers a patient with identity information from the register page', async () => {
    renderRoute('/register');

    expect(screen.getByRole('heading', { name: /patient registration/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Nguyen Van A' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'nguyen@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '0901234567' } });
    fireEvent.change(screen.getByLabelText(/national id/i), { target: { value: '0123456789' } });
    fireEvent.change(screen.getByLabelText(/permanent address/i), { target: { value: '123 Le Loi, District 1' } });
    fireEvent.click(screen.getByRole('button', { name: /create patient account/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            full_name: 'Nguyen Van A',
            email: 'nguyen@example.com',
            password: 'password123',
            phone: '0901234567',
            national_id: '0123456789',
            permanent_address: '123 Le Loi, District 1',
          }),
        }),
      );
    });

    expect(await screen.findByText(/registration successful/i)).toBeInTheDocument();
  });

  it('logs in through the backend API and stores the returned JWT', async () => {
    renderRoute('/login');

    fireEvent.click(screen.getByRole('button', { name: /doctor demo/i }));

    expect(await screen.findByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(localStorage.getItem('telehealth_token')).toBe('test-token-doctor');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'doctor@example.com', password: 'password123' }),
      }),
    );
  });

  it('loads doctors from the API and posts appointment booking requests', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    renderRoute('/patient/book');

    expect((await screen.findAllByText(/dr\. api heart/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole('option', { name: /09:00/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create pending appointment/i }));
    fireEvent.click(screen.getByRole('button', { name: /creating appointment/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/appointments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            doctorId: 2,
            scheduledDate: '2026-05-07',
            scheduledTime: '09:00',
            reason: 'Headache and mild fever for 2 days. Requesting remote consultation.',
          }),
        }),
      );
    });

    const appointmentPosts = fetch.mock.calls.filter(([url, options]) => String(url).includes('/appointments') && options?.method === 'POST');
    expect(appointmentPosts).toHaveLength(1);
    expect(await screen.findByText(/appointment booked successfully/i)).toBeInTheDocument();
  });

  it('shows duplicate booking notifications from idempotent appointment responses', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    renderRoute('/patient/book');

    expect(await screen.findByRole('option', { name: /09:30/i })).toBeInTheDocument();
    const timeSelect = await screen.findByLabelText(/time/i);
    fireEvent.change(timeSelect, { target: { value: '09:30' } });
    fireEvent.click(screen.getByRole('button', { name: /create pending appointment/i }));

    expect(await screen.findByText(/already submitted/i)).toBeInTheDocument();
  });

  it('filters doctors on the booking page by specialty, name, date, and max fee', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    renderRoute('/patient/book');

    expect(await screen.findByLabelText(/doctor name/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/doctor name/i), { target: { value: 'Heart' } });
    fireEvent.change(screen.getByLabelText(/specialty/i), { target: { value: 'Cardiology' } });
    fireEvent.change(screen.getByLabelText(/maximum fee/i), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-07' } });
    fireEvent.click(screen.getByRole('button', { name: /apply doctor filters/i }));

    await waitFor(() => {
      const doctorFilterCall = fetch.mock.calls.find(([url]) => {
        const value = String(url);
        return value.includes('/doctors?') && value.includes('specialty=Cardiology') && value.includes('q=Heart') && value.includes('maxFee=40') && value.includes('date=2026-05-07');
      });
      expect(doctorFilterCall).toBeTruthy();
    });
    expect((await screen.findAllByText(/dr\. api heart/i)).length).toBeGreaterThan(0);
  });

  it('submits the generated symptom summary to the backend API', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 1, role: 'patient', name: 'Ava Nguyen' }));
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    const sendButton = screen.getByRole('button', { name: /send answer/i });
    const answers = ['Fatigue', '2 days', 'No', 'None', 'None', 'No previous history'];

    answers.forEach((answer) => {
      fireEvent.change(input, { target: { value: answer } });
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/symptoms'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mainSymptom":"Fatigue"'),
        }),
      );
    });

    const symptomPost = fetch.mock.calls.find(([url, options]) => String(url).includes('/symptoms') && options?.method === 'POST');
    const body = JSON.parse(symptomPost[1].body);
    expect(body.priority).toBe('NORMAL');
    expect(body.doctorSummary).toMatch(/patient reports fatigue/i);
  });

  it('renders patient dashboard with core sections', async () => {
    renderRoute('/patient');

    expect(screen.getByRole('heading', { name: /patient dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/upcoming appointment/i)).toBeInTheDocument();
    expect(screen.getByText(/recent medical records/i)).toBeInTheDocument();
    expect(await screen.findByText(/api blood test/i)).toBeInTheDocument();
  });

  it('loads patient consultation result content from the API', async () => {
    apiConsultationsResponse = [
      {
        id: 90,
        appointmentId: 10,
        patientId: 1,
        doctorId: 2,
        doctorName: 'Dr. Real API',
        diagnosis: 'API follow-up review',
        prescription: 'No prescription changes',
        advice: 'Continue rest and hydration',
        followUp: 'Review again next week',
        createdAt: '2026-05-12T10:00:00.000Z',
      },
    ];

    renderRoute('/patient/result');

    expect(await screen.findByText(/api follow-up review/i)).toBeInTheDocument();
    expect(screen.getByText(/dr\. real api/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add to calendar/i })).toHaveAttribute('href', 'http://localhost:4000/appointments/10/calendar.ics');
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/consultations'), expect.any(Object));
    });
    expect(screen.queryByText(/acute viral syndrome/i)).not.toBeInTheDocument();
  });

  it('shows an empty patient consultation result state when the API has no results', async () => {
    renderRoute('/patient/result');

    expect(await screen.findByText(/no consultation results yet/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/consultations'), expect.any(Object));
    });
  });

  it('navigates from patient dashboard statistic cards', async () => {
    const appointmentsView = renderRoute('/patient');

    fireEvent.click(screen.getByRole('link', { name: /appointments statistic/i }));
    expect(await screen.findByRole('heading', { name: /book appointment/i })).toBeInTheDocument();
    appointmentsView.unmount();

    const recordsView = renderRoute('/patient');
    fireEvent.click(screen.getByRole('link', { name: /medical records statistic/i }));
    expect(await screen.findByRole('heading', { name: /^medical records$/i })).toBeInTheDocument();
    recordsView.unmount();

    renderRoute('/patient');
    fireEvent.click(screen.getByRole('link', { name: /consultation results statistic/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /patient consultation result/i })).toBeInTheDocument();
  });

  it('renders doctor dashboard workload table', async () => {
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 2, role: 'doctor', name: 'Dr. Session Provider', email: 'doctor@example.com' }));
    renderRoute('/doctor');

    expect(screen.getByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(screen.getAllByText(/dr\. session provider/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/today appointments/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /patient/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ava nguyen/i })).toHaveAttribute('href', '/doctor/patients/1');
      expect(screen.getByRole('link', { name: /minh tran/i })).toHaveAttribute('href', '/doctor/patients/4');
      expect(screen.getAllByRole('link', { name: /write note/i }).some((link) => link.getAttribute('href') === '/doctor/consultation/14')).toBe(true);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/appointments'), expect.any(Object));
    });
  });

  it('lets doctors confirm pending appointments from the dashboard', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ava nguyen/i })).toHaveAttribute('href', '/doctor/patients/1');
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm ava nguyen appointment/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/appointments/10/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        }),
      );
    });

    expect(await screen.findByText(/appointment confirmed successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/^CONFIRMED$/)).toBeInTheDocument();
  });

  it('lets doctors cancel assigned appointments with a reason', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ava nguyen/i })).toHaveAttribute('href', '/doctor/patients/1');
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel ava nguyen appointment/i }));
    expect(await screen.findByRole('heading', { name: /cancel appointment/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/cancellation reason/i), { target: { value: 'Doctor emergency' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm cancellation/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/appointments/10/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'CANCELLED', cancellationReason: 'Doctor emergency' }),
        }),
      );
    });

    expect(await screen.findByText(/appointment cancelled successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/^CANCELLED$/)).toBeInTheDocument();
  });

  it('exposes calendar export links for patient and doctor appointments', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    const patientView = renderRoute('/patient');

    expect(await screen.findByRole('link', { name: /add upcoming appointment to calendar/i })).toHaveAttribute('href', 'http://localhost:4000/appointments/10/calendar.ics');
    patientView.unmount();

    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/14');

    expect(await screen.findByText(/minh tran/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add appointment to calendar/i })).toHaveAttribute('href', 'http://localhost:4000/appointments/14/calendar.ics');
  });

  it('lets patients open the video room for a confirmed consultation inside the access window', async () => {
    const originalAppointment = { ...apiAppointments[0] };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    Object.assign(apiAppointments[0], {
      status: 'CONFIRMED',
      ...appointmentPartsFromNow(5),
    });
    apiConsultationsResponse = [
      {
        id: 90,
        appointmentId: 10,
        patientId: 1,
        doctorId: 2,
        doctorName: 'Dr. Real API',
        diagnosis: 'API follow-up review',
        prescription: 'No prescription changes',
        advice: 'Continue rest and hydration',
        followUp: 'Review again next week',
        createdAt: '2026-05-12T10:00:00.000Z',
      },
    ];

    try {
      localStorage.setItem('telehealth_token', 'test-token-patient');
      renderRoute('/patient/result');

      fireEvent.click(await screen.findByRole('button', { name: /join video call/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/appointments/10/video-room'), expect.any(Object));
        expect(openSpy).toHaveBeenCalledWith(
          'https://meet.jit.si/mediconnect-appointment-10',
          '_blank',
          'noopener,noreferrer',
        );
      });
      expect(await screen.findByText(/video call room opened/i)).toBeInTheDocument();
    } finally {
      Object.assign(apiAppointments[0], originalAppointment);
      openSpy.mockRestore();
    }
  });

  it('shows a disabled doctor video call button outside the confirmed appointment access window', async () => {
    const originalAppointment = { ...apiAppointments[1] };
    Object.assign(apiAppointments[1], {
      status: 'CONFIRMED',
      ...appointmentPartsFromNow(24 * 60),
    });

    try {
      localStorage.setItem('telehealth_token', 'test-token-doctor');
      renderRoute('/doctor/consultation/14');

      const joinButton = await screen.findByRole('button', { name: /join video call/i });
      expect(joinButton).toBeDisabled();
      expect(screen.getByText(/video call will be available 15 minutes before/i)).toBeInTheDocument();
    } finally {
      Object.assign(apiAppointments[1], originalAppointment);
    }
  });

  it('loads doctor patient records from the API and exposes uploaded files', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/1');

    expect(await screen.findByText(/api blood test/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /chest-xray\.png/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open chest-xray\.png/i })).toHaveAttribute('href', 'http://localhost:4000/uploads/chest-xray.png');
    expect(screen.getByRole('link', { name: /open blood-test\.pdf/i })).toHaveAttribute('href', 'http://localhost:4000/uploads/blood-test.pdf');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/records'), expect.any(Object)));
  });

  it('loads the selected doctor patient detail from the route patient id', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/4');

    expect(await screen.findByRole('heading', { name: /patient detail/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /minh tran/i })).toBeInTheDocument();
    expect(screen.getByText(/minh@example\.com/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chest tightness and fatigue/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /write note/i })).toHaveAttribute('href', '/doctor/consultation/14');
    expect(screen.queryByText(/jane@example\.com/i)).not.toBeInTheDocument();
  });

  it('keeps doctor patient detail stable on direct route refresh', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/4');

    expect(await screen.findByRole('heading', { name: /minh tran/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/patients/4'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/appointments'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/records'), expect.any(Object));
    });
  });

  it('shows empty states for doctor patient detail when patient has no submitted data yet', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/6');

    expect(await screen.findByRole('heading', { name: /empty patient/i })).toBeInTheDocument();
    expect(screen.getByText(/no symptom summary submitted yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no medical records uploaded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no consultation history yet/i)).toBeInTheDocument();
  });

  it('redirects invalid doctor patient routes to dashboard with a not found message', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/999');

    expect(await screen.findByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/patient or appointment not found/i)).toBeInTheDocument();
  });

  it('redirects unauthorized doctor patient routes to dashboard with a permission message', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/patients/8');

    expect(await screen.findByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/you do not have permission to access this resource/i)).toBeInTheDocument();
  });

  it('loads the selected consultation note from the route appointment id', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/14');

    expect(await screen.findByRole('heading', { name: /consultation note/i })).toBeInTheDocument();
    expect(await screen.findByText(/minh tran/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chest tightness and fatigue/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /back to patient detail/i })).toHaveAttribute('href', '/doctor/patients/4');
    expect(screen.queryByText(/ava nguyen/i)).not.toBeInTheDocument();
  });

  it('keeps consultation note stable on direct route refresh', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/14');

    expect(await screen.findByText(/minh tran/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/appointments/14'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/symptoms/patient/4'), expect.any(Object));
    });
  });

  it('redirects invalid consultation routes to dashboard with a not found message', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/999');

    expect(await screen.findByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/patient or appointment not found/i)).toBeInTheDocument();
  });

  it('redirects unauthorized consultation routes to dashboard with a permission message', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/18');

    expect(await screen.findByRole('heading', { name: /doctor dashboard/i })).toBeInTheDocument();
    expect(await screen.findByText(/you do not have permission to access this resource/i)).toBeInTheDocument();
  });

  it('saves consultation notes once and shows success feedback', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/consultation/14');

    expect(await screen.findByText(/minh tran/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^diagnosis$/i), { target: { value: 'Follow-up review' } });
    fireEvent.change(screen.getByLabelText(/^prescription$/i), { target: { value: 'No medication changes' } });
    fireEvent.change(screen.getByLabelText(/^advice$/i), { target: { value: 'Rest and monitor symptoms' } });
    fireEvent.change(screen.getByLabelText(/follow-up/i), { target: { value: 'Follow up next week' } });

    fireEvent.click(screen.getByRole('button', { name: /save consultation note/i }));
    fireEvent.click(screen.getByRole('button', { name: /saving consultation note/i }));

    await waitFor(() => {
      const consultationPosts = fetch.mock.calls.filter(([url, options]) => String(url).includes('/consultations') && options?.method === 'POST');
      expect(consultationPosts).toHaveLength(1);
    });
    expect(await screen.findByText(/consultation note saved/i)).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/appointments/14')).length).toBeGreaterThanOrEqual(2);
  });

  it('renders admin system overview metrics', async () => {
    renderRoute('/admin');

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/total users/i)).toBeInTheDocument();
    expect(screen.getByText(/users by role/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('6')).toBeInTheDocument());
  });

  it('renders admin audit logs with filters and pagination', async () => {
    localStorage.setItem('telehealth_token', 'test-token-admin');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 3, role: 'admin', name: 'Admin Session', email: 'admin@example.com' }));
    renderRoute('/admin/audit-logs');

    expect(await screen.findByRole('heading', { name: /audit logs/i })).toBeInTheDocument();
    expect(await screen.findByText(/doctor\.created/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/action type/i), { target: { value: 'appointment.created' } });
    fireEvent.change(screen.getByLabelText(/actor role/i), { target: { value: 'patient' } });
    fireEvent.click(screen.getByRole('button', { name: /apply audit filters/i }));

    await waitFor(() => {
      const auditCall = fetch.mock.calls.find(([url]) => {
        const value = String(url);
        return value.includes('/admin/audit-logs?') && value.includes('action=appointment.created') && value.includes('actorRole=patient');
      });
      expect(auditCall).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
  });

  it('renders admin doctor management and creates doctors', async () => {
    localStorage.setItem('telehealth_token', 'test-token-admin');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 3, role: 'admin', name: 'Admin Session', email: 'admin@example.com' }));
    renderRoute('/admin/doctors');

    expect(await screen.findByRole('heading', { name: /doctor management/i })).toBeInTheDocument();
    expect(await screen.findByText(/dr\. admin skin/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Dr. Created User' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'created-doctor@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'doctor123' } });
    fireEvent.change(screen.getByLabelText(/specialty/i), { target: { value: 'Pediatrics' } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '0911111111' } });
    fireEvent.change(screen.getByLabelText(/bio/i), { target: { value: 'Pediatric telehealth doctor.' } });
    fireEvent.change(screen.getByLabelText(/consultation fee/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /create doctor/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/doctors'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            full_name: 'Dr. Created User',
            email: 'created-doctor@example.com',
            password: 'doctor123',
            specialty: 'Pediatrics',
            phone: '0911111111',
            bio: 'Pediatric telehealth doctor.',
            consultation_fee: 50,
          }),
        }),
      );
    });

    expect(await screen.findByText(/doctor account created/i)).toBeInTheDocument();
  });

  it('lets admins approve pending doctor leave requests', async () => {
    localStorage.setItem('telehealth_token', 'test-token-admin');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 3, role: 'admin', name: 'Admin Session', email: 'admin@example.com' }));
    renderRoute('/admin/doctors');

    expect(await screen.findByText(/family leave/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approve family leave leave request/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/leave-requests/31/approve'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(await screen.findByText(/leave request approved/i)).toBeInTheDocument();
    expect(screen.getByText(/^APPROVED$/)).toBeInTheDocument();
  });

  it('lets admins reactivate and soft delete doctors', async () => {
    localStorage.setItem('telehealth_token', 'test-token-admin');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 3, role: 'admin', name: 'Admin Session', email: 'admin@example.com' }));
    renderRoute('/admin/doctors');

    expect(await screen.findByText(/dr\. admin skin/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /deactivate dr\. admin skin/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/7/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'INACTIVE' }),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /reactivate dr\. admin skin/i }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/7/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'ACTIVE' }),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /delete dr\. admin skin/i }));
    expect(await screen.findByRole('heading', { name: /delete doctor/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm delete doctor/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/doctors/7'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(await screen.findByText(/doctor deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/^DELETED$/)).toBeInTheDocument();
  });

  it('renders a polished medical record upload state', async () => {
    renderRoute('/patient/records');

    expect(screen.getByRole('heading', { name: /medical records/i })).toBeInTheDocument();
    expect(screen.getByText(/upload medical document/i)).toBeInTheDocument();
    expect(screen.getByText(/supported formats/i)).toBeInTheDocument();
    expect(screen.queryByText(/mock upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mock storage preview/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/api blood test/i)).toBeInTheDocument();
  });

  it('selects and uploads medical record files with multipart form data', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    renderRoute('/patient/records');

    const file = new File(['%PDF demo'], 'lab-result.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/medical record file/i), { target: { files: [file] } });

    expect(await screen.findByText(/lab-result\.pdf/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /upload selected file/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/records/50/upload'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });
    expect(await screen.findByText(/upload successful/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open lab-result\.pdf/i })).toHaveAttribute('href', 'http://localhost:4000/uploads/lab-result.pdf');

    fireEvent.click(screen.getByRole('button', { name: /delete new lab result/i }));
    expect(await screen.findByRole('heading', { name: /delete medical record/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm delete record/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/records/50'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(await screen.findByText(/medical record deleted/i)).toBeInTheDocument();
  });

  it('renders doctor schedule management with multiple sessions and submits leave requests', async () => {
    localStorage.setItem('telehealth_token', 'test-token-doctor');
    renderRoute('/doctor/schedule');

    expect(await screen.findByRole('heading', { name: /doctor schedule/i })).toBeInTheDocument();
    expect(await screen.findByText(/family leave/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add monday session/i }));
    fireEvent.change(screen.getByLabelText(/monday session 3 start/i), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText(/monday session 3 end/i), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText(/monday session 3 duration/i), { target: { value: '30' } });

    fireEvent.click(screen.getByRole('button', { name: /save schedule/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/doctors/me/availability'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    const schedulePut = fetch.mock.calls.find(([url, options]) => String(url).includes('/doctors/me/availability') && options?.method === 'PUT');
    expect(JSON.parse(schedulePut[1].body).availability.filter((item) => item.weekday === 1)).toHaveLength(3);

    fireEvent.change(screen.getByLabelText(/leave date/i), { target: { value: '2026-05-21' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Holiday' } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Family travel' } });
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/leave-requests'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ date: '2026-05-21', reason: 'Holiday', note: 'Family travel' }),
        }),
      );
    });
    expect(await screen.findByText(/leave request submitted/i)).toBeInTheDocument();
  });

  it('shows blocked booking slots after approved doctor leave removes availability', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    renderRoute('/patient/book');

    expect(await screen.findByRole('option', { name: /09:00/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-19' } });

    expect(await screen.findByText(/no available slots for this doctor and date/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /no available slots/i })).toBeInTheDocument();
  });

  it('collects chatbot base answers and saves a NORMAL structured symptom summary', async () => {
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    const sendButton = screen.getByRole('button', { name: /send answer/i });
    const answers = ['Fatigue', '2 days', 'No', 'None', 'None', 'No previous history'];

    expect(screen.getByText(/what symptoms are you experiencing/i)).toBeInTheDocument();
    expect(screen.getAllByText(/this chatbot does not provide diagnosis or prescription/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/symptom assistant/i).length).toBeGreaterThan(0);

    answers.forEach((answer) => {
      fireEvent.change(input, { target: { value: answer } });
      fireEvent.click(sendButton);
    });

    expect(screen.getByText(/main symptom/i)).toBeInTheDocument();
    expect(screen.getAllByText('Fatigue').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/priority/i)).toBeInTheDocument();
    expect(screen.getByText(/^NORMAL$/)).toBeInTheDocument();
    expect(screen.getByText(/patient reports fatigue for 2 days/i)).toBeInTheDocument();
    expect(screen.getByText(/current medication: none/i)).toBeInTheDocument();
    expect(screen.getByText(/allergies: none/i)).toBeInTheDocument();
    expect(screen.getByText(/previous medical history: no previous history/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart chat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /book appointment/i })).toBeInTheDocument();
    expect(screen.queryByText(/diagnosis:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prescription:/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restart chat/i }));

    expect(screen.getByText(/what symptoms are you experiencing/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type your answer/i)).toBeEnabled();
    expect(screen.queryByText(/main symptom/i)).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/symptoms'), expect.any(Object)));
  });

  it('adds fever follow-up questions during symptom collection', async () => {
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    const sendButton = screen.getByRole('button', { name: /send answer/i });

    fireEvent.change(input, { target: { value: 'Fever' } });
    fireEvent.click(sendButton);

    expect(await screen.findByText(/what is your temperature/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '38.5 C' } });
    fireEvent.click(sendButton);

    expect(await screen.findByText(/do you have chills/i)).toBeInTheDocument();
  });

  it('adds headache follow-up questions during symptom collection', async () => {
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(input, { target: { value: 'Headache' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    expect(await screen.findByText(/pain level from 1-10/i)).toBeInTheDocument();
  });

  it('marks chest pain with red flags as HIGH priority and saves structured summary', async () => {
    localStorage.setItem('telehealth_token', 'test-token-patient');
    localStorage.setItem('telehealth_user', JSON.stringify({ id: 1, role: 'patient', name: 'Ava Nguyen' }));
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    const sendButton = screen.getByRole('button', { name: /send answer/i });
    [
      'Chest pain',
      '9',
      'Yes, shortness of breath',
      'Yes, radiates to arm',
      '1 hour',
      'No',
      'None',
      'None',
      'No previous history',
    ].forEach((answer) => {
      fireEvent.change(input, { target: { value: answer } });
      fireEvent.click(sendButton);
    });

    expect(await screen.findByText(/^HIGH$/)).toBeInTheDocument();
    expect(screen.getAllByText(/red flags/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/chest pain with shortness of breath/i).length).toBeGreaterThan(0);

    await waitFor(() => {
      const symptomPost = fetch.mock.calls.find(([url, options]) => String(url).includes('/symptoms') && options?.method === 'POST');
      expect(symptomPost).toBeTruthy();
      const body = JSON.parse(symptomPost[1].body);
      expect(body.priority).toBe('HIGH');
      expect(body.redFlags).toContain('chest pain with shortness of breath');
      expect(body.conditionalAnswers).toEqual(expect.objectContaining({
        'Chest pain severity': '9',
        'Shortness of breath': 'Yes, shortness of breath',
      }));
    });
  });

  it('shows emergency warning without diagnosis or prescription', async () => {
    renderRoute('/patient/chatbot');

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'I have difficulty breathing and feel unconscious' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    expect(await screen.findByText(/please seek immediate emergency medical care/i)).toBeInTheDocument();
    expect(screen.queryByText(/diagnosis:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prescription:/i)).not.toBeInTheDocument();
  });

  it('answers doctor schedule inquiries from real backend APIs', async () => {
    renderRoute('/patient/chatbot');

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'Which doctors are available today?' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    expect(await screen.findByText(/dr\. api heart/i)).toBeInTheDocument();
    expect(screen.getByText(/09:00/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/doctors'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/doctors/2/slots'), expect.any(Object));
    });
  });

  it('answers appointment status inquiries from real backend APIs', async () => {
    renderRoute('/patient/chatbot');

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'What are my appointments?' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));

    expect(await screen.findByText(/ava nguyen/i)).toBeInTheDocument();
    expect(screen.getByText(/PENDING/i)).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/appointments'), expect.any(Object)));
  });

  it('answers upload, booking, cancellation, and unknown help intents safely', async () => {
    renderRoute('/patient/chatbot');

    const input = screen.getByPlaceholderText(/type your answer/i);
    const sendButton = screen.getByRole('button', { name: /send answer/i });

    fireEvent.change(input, { target: { value: 'What file types can I upload?' } });
    fireEvent.click(sendButton);
    expect(await screen.findByText(/PDF, JPG, PNG/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'How do I book an appointment?' } });
    fireEvent.click(sendButton);
    expect(await screen.findByText(/choose doctor/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'How can I cancel my appointment?' } });
    fireEvent.click(sendButton);
    expect(await screen.findByText(/provide a cancellation reason/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Tell me about random topic' } });
    fireEvent.click(sendButton);
    expect(await screen.findByText(/I can help with symptoms, doctor schedules, appointments, booking, uploads, or cancellations/i)).toBeInTheDocument();
  });

  it('shows doctor-facing priority and red flags in patient detail', async () => {
    apiSymptomsByPatient['1'] = [
      {
        id: 88,
        patientId: 1,
        mainSymptom: 'Chest pain',
        duration: '1 hour',
        severity: '9',
        fever: 'No',
        medication: 'None',
        allergies: 'None',
        previousHistory: 'No previous history',
        conditionalAnswers: {
          'Chest pain severity': '9',
          'Shortness of breath': 'Yes',
        },
        redFlags: ['chest pain with shortness of breath', 'severe chest pain'],
        priority: 'HIGH',
        doctorSummary: 'Patient reports chest pain for 1 hour. Priority: HIGH. Red flags: chest pain with shortness of breath, severe chest pain.',
        summary: 'Patient reports chest pain for 1 hour.',
        createdAt: '2026-05-14T08:00:00.000Z',
      },
    ];
    localStorage.setItem('telehealth_token', 'test-token-doctor');

    renderRoute('/doctor/patients/1');

    expect(await screen.findByRole('heading', { name: /ava nguyen/i })).toBeInTheDocument();
    expect(screen.getByText(/^HIGH$/)).toBeInTheDocument();
    expect(screen.getAllByText(/chest pain with shortness of breath/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/patient reports chest pain for 1 hour/i)).toBeInTheDocument();
  });
});
