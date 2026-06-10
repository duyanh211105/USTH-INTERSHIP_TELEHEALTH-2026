import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telehealth-api-'));
process.env.DB_CLIENT = 'sqlite';
process.env.DB_FILE = path.join(testDir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(testDir, 'uploads');
process.env.JWT_SECRET = 'test-secret';
delete process.env.DATABASE_URL;

const { default: app } = await import('../app.js');
const { closeDatabase, getDatabase } = await import('../db/connection.js');
const { initializeDatabase, postgresSchemaSql } = await import('../db/schema.js');
const { seedDatabase } = await import('../db/seed.js');
const { getSpecialtyLabel, normalizeSpecialtyCode } = await import('../services/specialtyService.js');

async function login(phone, password = 'password123') {
  const response = await request(app)
    .post('/auth/login')
    .send({ phone, password })
    .expect(200);

  return response.body.data.token;
}

function patientRegistration(overrides = {}) {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

  return {
    full_name: `Registered Patient ${suffix}`,
    email: `registered-${suffix}@example.com`,
    password: 'patientSecret123',
    phone: `09${String(Math.round(Math.random() * 1e8)).padStart(8, '0')}`,
    national_id: `0${String(Math.round(Math.random() * 1e10)).padStart(10, '1').slice(0, 10)}`,
    permanent_address: '123 Nguyen Trai, District 1, Ho Chi Minh City',
    ...overrides,
  };
}

describe('telehealth backend API', () => {
  let patientToken;
  let doctorToken;
  let adminToken;
  let patientId;
  let doctorId;

  function dateTimeOffsetMinutes(offsetMinutes) {
    const value = new Date(Date.now() + offsetMinutes * 60 * 1000);
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');

    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
    };
  }

  function nextUtcDateForWeekday(weekday) {
    const value = new Date();
    const currentWeekday = value.getUTCDay();
    const daysUntilTarget = (weekday - currentWeekday + 7) % 7 || 7;
    value.setUTCDate(value.getUTCDate() + daysUntilTarget);
    return value.toISOString().slice(0, 10);
  }

  function insertVideoAppointment({
    status = 'PENDING',
    offsetMinutes = 5,
    patient = patientId,
    doctor = doctorId,
    reason = 'Video consultation test',
    videoRoomUrl = null,
    videoRoomProvider = null,
  } = {}) {
    const { date, time } = dateTimeOffsetMinutes(offsetMinutes);
    const result = getDatabase()
      .prepare(
        `INSERT INTO appointments (
          patient_id,
          doctor_id,
          scheduled_date,
          scheduled_time,
          reason,
          status,
          video_room_url,
          video_room_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(patient, doctor, date, time, reason, status, videoRoomUrl, videoRoomProvider);

    return Number(result.lastInsertRowid);
  }

  before(async () => {
    await initializeDatabase();
    await seedDatabase();
    patientToken = await login('0900000001');
    doctorToken = await login('0900000002');
    adminToken = await login('0123456789');

    const patientMe = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    patientId = patientMe.body.data.user.id;

    const doctors = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    doctorId = doctors.body.data.doctors[0].id;
  });

  after(async () => {
    await closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('authenticates demo users and returns the current user', async () => {
    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(response.body.success, true);
    assert.equal(response.body.data.user.email, 'patient@example.com');
    assert.equal(response.body.data.user.role, 'patient');
    assert.equal(response.body.data.user.password_hash, undefined);
  });

  it('authenticates users by phone number and rejects email-based login payloads', async () => {
    const phoneLogin = await request(app)
      .post('/auth/login')
      .send({ phone: '0900000001', password: 'password123' })
      .expect(200);

    assert.equal(phoneLogin.body.data.user.phone, '0900000001');

    const emailLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'patient@example.com', password: 'password123' })
      .expect(400);

    assert.match(emailLogin.body.error.message, /phone/i);

    const invalidPhone = await request(app)
      .post('/auth/login')
      .send({ phone: 'patient@example.com', password: 'password123' })
      .expect(400);

    assert.match(invalidPhone.body.error.message, /phone/i);
  });

  it('requires JWT tokens for protected APIs', async () => {
    await request(app).get('/appointments').expect(401);
  });

  it('registers real patient accounts and allows login without exposing password hashes', async () => {
    const payload = patientRegistration({ national_id: '0123456799' });

    const registered = await request(app)
      .post('/auth/register')
      .send(payload)
      .expect(201);

    assert.equal(registered.body.success, true);
    assert.equal(registered.body.data.user.email, payload.email);
    assert.equal(registered.body.data.user.name, payload.full_name);
    assert.equal(registered.body.data.user.role, 'patient');
    assert.equal(registered.body.data.user.phone, payload.phone);
    assert.equal(registered.body.data.user.nationalId, payload.national_id);
    assert.equal(registered.body.data.user.permanentAddress, payload.permanent_address);
    assert.equal(registered.body.data.user.password_hash, undefined);

    const token = await login(payload.phone, payload.password);
    assert.equal(typeof token, 'string');
  });

  it('rejects duplicate patient registration email addresses', async () => {
    const payload = patientRegistration({ email: 'duplicate-patient@example.com', national_id: '0123456790' });

    await request(app).post('/auth/register').send(payload).expect(201);

    const duplicate = await request(app)
      .post('/auth/register')
      .send({ ...patientRegistration({ national_id: '0123456791' }), email: payload.email })
      .expect(409);

    assert.match(duplicate.body.error.message, /email/i);
  });

  it('rejects duplicate patient national ids', async () => {
    const payload = patientRegistration({ email: 'national-a@example.com', national_id: '0123456792' });

    await request(app).post('/auth/register').send(payload).expect(201);

    const duplicate = await request(app)
      .post('/auth/register')
      .send({ ...patientRegistration({ email: 'national-b@example.com' }), national_id: payload.national_id })
      .expect(409);

    assert.match(duplicate.body.error.message, /national/i);
  });

  it('rejects duplicate patient phone numbers', async () => {
    const payload = patientRegistration({ email: 'phone-a@example.com', national_id: '0123456888', phone: '0901234999' });

    await request(app).post('/auth/register').send(payload).expect(201);

    const duplicate = await request(app)
      .post('/auth/register')
      .send({ ...patientRegistration({ email: 'phone-b@example.com', national_id: '0123456889' }), phone: payload.phone })
      .expect(409);

    assert.match(duplicate.body.error.message, /phone/i);
  });

  it('validates patient national id format and permanent address', async () => {
    const invalidNationalId = await request(app)
      .post('/auth/register')
      .send(patientRegistration({ email: 'invalid-national@example.com', national_id: '123456789' }))
      .expect(400);

    assert.match(invalidNationalId.body.error.message, /national/i);

    const missingAddress = await request(app)
      .post('/auth/register')
      .send(patientRegistration({ email: 'missing-address@example.com', national_id: '0123456793', permanent_address: '' }))
      .expect(400);

    assert.match(missingAddress.body.error.message, /permanent/i);
  });

  it('lists doctors for authenticated users', async () => {
    const response = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(response.body.success, true);
    assert.ok(response.body.data.doctors.length > 0);
    assert.equal(response.body.data.doctors[0].role, 'doctor');
    assert.equal(typeof response.body.data.doctors[0].specialty, 'string');
  });

  it('filters active doctors by specialty, keyword, fee range, and availability date', async () => {
    const created = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Searchable Skin',
        email: 'searchable-skin@example.com',
        password: 'doctorSecret123',
        specialty: 'Dermatology',
        phone: '0911111112',
        bio: 'Dermatology search filter doctor.',
        consultation_fee: 80,
      })
      .expect(201);

    await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Searchable Neuro',
        email: 'searchable-neuro@example.com',
        password: 'doctorSecret123',
        specialty: 'Neurology',
        phone: '0911111113',
        bio: 'Neurology search filter doctor.',
        consultation_fee: 25,
      })
      .expect(201);

    const filtered = await request(app)
      .get('/doctors?specialty=Dermatology&q=skin&minFee=70&maxFee=90')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(filtered.body.data.doctors.some((doctor) => doctor.id === created.body.data.doctor.id), true);
    assert.equal(filtered.body.data.doctors.every((doctor) => doctor.specialty === 'Dermatology'), true);
    assert.equal(filtered.body.data.doctors.every((doctor) => doctor.consultationFee >= 70 && doctor.consultationFee <= 90), true);

    const availableDoctors = await request(app)
      .get(`/doctors?date=${nextUtcDateForWeekday(1)}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(availableDoctors.body.data.doctors.some((doctor) => doctor.id === doctorId), true);

    const unavailableDoctors = await request(app)
      .get(`/doctors?date=${nextUtcDateForWeekday(0)}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(unavailableDoctors.body.data.doctors.some((doctor) => doctor.id === doctorId), false);
  });

  it('normalizes legacy specialties and safely handles richer doctor search filters', async () => {
    assert.equal(normalizeSpecialtyCode('heart doctor'), 'CARDIOLOGY');
    assert.equal(normalizeSpecialtyCode('tim'), 'CARDIOLOGY');
    assert.equal(getSpecialtyLabel('CARDIOLOGY'), 'Cardiology');

    const heartDoctor = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Carter Heart',
        email: 'carter-heart@example.com',
        password: 'doctorSecret123',
        specialty: 'Heart Doctor',
        phone: '0911111190',
        bio: 'Legacy cardiology specialty text.',
        consultation_fee: 60,
      })
      .expect(201);

    const pediatricDoctor = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Pediatric Care',
        email: 'pediatric-care@example.com',
        password: 'doctorSecret123',
        specialty: 'PEDIATRICS',
        phone: '0911111191',
        bio: 'Pediatric care provider.',
        consultation_fee: 20,
      })
      .expect(201);

    assert.equal(heartDoctor.body.data.doctor.specialty, 'Cardiology');
    assert.equal(heartDoctor.body.data.doctor.specialtyCode, 'CARDIOLOGY');
    assert.equal(pediatricDoctor.body.data.doctor.specialty, 'Pediatrics');

    const filtered = await request(app)
      .get('/doctors?specialty=CARDIOLOGY&q=car&minFee=&maxFee=not-a-number&videoAvailable=true&sort=lowest_fee')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(filtered.body.data.doctors.some((doctor) => doctor.id === heartDoctor.body.data.doctor.id), true);
    assert.equal(filtered.body.data.doctors.every((doctor) => doctor.specialtyCode === 'CARDIOLOGY'), true);
    assert.equal(filtered.body.data.doctors.every((doctor) => doctor.videoConsultationAvailable === true), true);

    const availableToday = await request(app)
      .get('/doctors?availableToday=true&sort=unknown-sort')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(Array.isArray(availableToday.body.data.doctors), true);

    const unknownSpecialty = await request(app)
      .get('/doctors?specialty=NOT_A_SPECIALTY&minFee=bad&maxFee=')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(Array.isArray(unknownSpecialty.body.data.doctors), true);
  });

  it('filters doctors by qualification, experience, rating, language, gender, and real availability windows', async () => {
    const created = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Qualified Search',
        email: 'qualified-search@example.com',
        password: 'doctorSecret123',
        specialty: 'Neurology',
        qualification_title: 'SPECIALIST_LEVEL_II',
        phone: '0911111188',
        bio: 'Advanced neurology provider.',
        consultation_fee: 95,
        years_of_experience: 16,
        gender: 'Female',
        languages_spoken: 'Vietnamese, English',
      })
      .expect(201);
    const createdDoctor = created.body.data.doctor;

    const insertSchedule = getDatabase().prepare(`
      INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      insertSchedule.run(createdDoctor.id, weekday, '08:00', '09:00', 30);
    }

    const filtered = await request(app)
      .get('/doctors?qualificationTitle=SPECIALIST_LEVEL_II&minExperience=10&minRating=4.5&gender=Female&language=English&availableThisWeek=true&sort=earliest_availability')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const doctor = filtered.body.data.doctors.find((item) => item.id === createdDoctor.id);
    assert.ok(doctor);
    assert.equal(doctor.qualificationTitle, 'Specialist Level II');
    assert.equal(doctor.qualificationCode, 'SPECIALIST_LEVEL_II');
    assert.equal(doctor.yearsOfExperience, 16);
    assert.equal(doctor.gender, 'Female');
    assert.match(doctor.languagesSpoken, /English/);
    assert.ok(doctor.nextAvailableSlot);
    assert.match(doctor.availabilitySummary, /Next Available|Available/);
  });

  it('allows one patient doctor review after a completed appointment and updates cached rating fields', async () => {
    const appointmentId = insertVideoAppointment({ status: 'COMPLETED', offsetMinutes: -30, reason: 'Completed review appointment' });

    const createdReview = await request(app)
      .post(`/doctors/${doctorId}/reviews`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        appointmentId,
        rating: 5,
        comment: 'Doctor explained everything clearly and was very attentive.',
      })
      .expect(201);

    assert.equal(createdReview.body.data.review.rating, 5);
    assert.equal(createdReview.body.data.review.appointmentId, appointmentId);

    await request(app)
      .post(`/doctors/${doctorId}/reviews`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ appointmentId, rating: 4 })
      .expect(409);

    const doctors = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    const reviewedDoctor = doctors.body.data.doctors.find((doctor) => doctor.id === doctorId);
    assert.equal(reviewedDoctor.averageRating, 5);
    assert.equal(reviewedDoctor.reviewCount, 1);

    const pendingAppointmentId = insertVideoAppointment({ status: 'PENDING', offsetMinutes: 45, reason: 'Pending review not allowed' });
    await request(app)
      .post(`/doctors/${doctorId}/reviews`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ appointmentId: pendingAppointmentId, rating: 5 })
      .expect(400);
  });

  it('lets admins create, edit, list, and deactivate doctors', async () => {
    const payload = {
      full_name: 'Dr. New Provider',
      email: 'new-provider@example.com',
      password: 'doctorSecret123',
      specialty: 'Dermatology',
      phone: '0912345678',
      bio: 'Remote dermatology consultation provider.',
      availability_summary: 'Mon-Wed, 10:00 AM - 3:00 PM',
      consultation_fee: 45,
    };

    const created = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    const doctor = created.body.data.doctor;
    assert.equal(doctor.email, payload.email);
    assert.equal(doctor.name, payload.full_name);
    assert.equal(doctor.role, 'doctor');
    assert.equal(doctor.specialty, payload.specialty);
    assert.equal(doctor.phone, payload.phone);
    assert.equal(doctor.consultationFee, payload.consultation_fee);
    assert.equal(doctor.password_hash, undefined);

    const adminDoctors = await request(app)
      .get('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(adminDoctors.body.data.doctors.some((item) => item.id === doctor.id), true);

    const edited = await request(app)
      .patch(`/admin/doctors/${doctor.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ specialty: 'Family Medicine', consultation_fee: 55, availability_summary: 'Weekdays' })
      .expect(200);
    assert.equal(edited.body.data.doctor.specialty, 'General Medicine');
    assert.equal(edited.body.data.doctor.consultationFee, 55);

    const publicDoctors = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(publicDoctors.body.data.doctors.some((item) => item.id === doctor.id), true);

    await request(app)
      .patch(`/admin/users/${doctor.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const activeDoctors = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(activeDoctors.body.data.doctors.some((item) => item.id === doctor.id), false);
  });

  it('supports doctor reactivation, inactive login blocking, and protected soft deletion', async () => {
    const created = await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dr. Lifecycle Test',
        email: 'lifecycle-doctor@example.com',
        password: 'password123',
        specialty: 'Internal Medicine',
        phone: '0909999999',
        bio: 'Lifecycle test doctor',
        consultation_fee: 70,
      })
      .expect(201);
    const lifecycleDoctorId = created.body.data.doctor.id;

    await request(app)
      .patch(`/admin/users/${lifecycleDoctorId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    await request(app)
      .post('/auth/login')
      .send({ phone: '0909999999', password: 'password123' })
      .expect(403);

    const visibleDoctors = await request(app)
      .get('/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(visibleDoctors.body.data.doctors.some((doctor) => doctor.id === lifecycleDoctorId), false);

    await request(app)
      .patch(`/admin/users/${lifecycleDoctorId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const lifecycleDoctorToken = await login('0909999999');

    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${lifecycleDoctorToken}`)
      .send({
        availability: [
          { weekday: 3, startTime: '09:00', endTime: '10:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const booked = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId: lifecycleDoctorId,
        scheduledDate: nextUtcDateForWeekday(3),
        scheduledTime: '09:00',
        reason: 'Future confirmed delete protection',
      })
      .expect(201);

    await request(app)
      .patch(`/appointments/${booked.body.data.appointment.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const blockedDelete = await request(app)
      .delete(`/admin/doctors/${lifecycleDoctorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    assert.match(blockedDelete.body.error.message, /future confirmed/i);

    await request(app)
      .patch(`/appointments/${booked.body.data.appointment.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED', cancellationReason: 'Admin cleanup' })
      .expect(200);

    const deleted = await request(app)
      .delete(`/admin/doctors/${lifecycleDoctorId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(deleted.body.data.doctor.status, 'DELETED');

    await request(app)
      .post('/auth/login')
      .send({ phone: '0909999999', password: 'password123' })
      .expect(403);
  });

  it('prevents non-admin users from creating doctors', async () => {
    await request(app)
      .post('/admin/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        full_name: 'Dr. Forbidden',
        email: 'forbidden-doctor@example.com',
        password: 'password123',
        specialty: 'Neurology',
      })
      .expect(403);
  });

  it('creates appointments and allows doctors to update appointment status', async () => {
    const created = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-11',
        scheduledTime: '10:30',
        reason: 'Headache and mild fever',
      })
      .expect(201);

    assert.equal(created.body.success, true);
    assert.equal(created.body.data.appointment.status, 'PENDING');

    const appointmentId = created.body.data.appointment.id;

    const updated = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    assert.equal(updated.body.data.appointment.status, 'CONFIRMED');

    const listed = await request(app)
      .get('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(listed.body.data.appointments.some((appointment) => appointment.id === appointmentId), true);
  });

  it('returns only the next five future pending or confirmed appointments from the upcoming endpoint', async () => {
    getDatabase().prepare("UPDATE appointments SET status = 'CANCELLED' WHERE patient_id = ?").run(patientId);

    const insertedIds = [
      insertVideoAppointment({ status: 'PENDING', offsetMinutes: 90, reason: 'Upcoming pending 90' }),
      insertVideoAppointment({ status: 'CONFIRMED', offsetMinutes: 30, reason: 'Upcoming confirmed 30' }),
      insertVideoAppointment({ status: 'CONFIRMED', offsetMinutes: 60, reason: 'Upcoming confirmed 60' }),
      insertVideoAppointment({ status: 'PENDING', offsetMinutes: 120, reason: 'Upcoming pending 120' }),
      insertVideoAppointment({ status: 'PENDING', offsetMinutes: 150, reason: 'Upcoming pending 150' }),
      insertVideoAppointment({ status: 'PENDING', offsetMinutes: 180, reason: 'Upcoming pending 180' }),
      insertVideoAppointment({ status: 'COMPLETED', offsetMinutes: 15, reason: 'Completed should not appear' }),
      insertVideoAppointment({ status: 'CANCELLED', offsetMinutes: 20, reason: 'Cancelled should not appear' }),
      insertVideoAppointment({ status: 'PENDING', offsetMinutes: -20, reason: 'Past should not appear' }),
    ];

    const response = await request(app)
      .get('/appointments/upcoming')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const appointments = response.body.data.appointments;
    assert.equal(appointments.length, 5);
    assert.deepEqual(
      appointments.map((appointment) => appointment.appointmentId),
      [insertedIds[1], insertedIds[2], insertedIds[0], insertedIds[3], insertedIds[4]],
    );
    assert.equal(appointments.every((appointment) => ['PENDING', 'CONFIRMED'].includes(appointment.status)), true);
    assert.equal(appointments.some((appointment) => appointment.appointmentId === insertedIds[5]), false);
    assert.equal(appointments.every((appointment) => appointment.doctorName && appointment.appointmentDate && appointment.appointmentTime), true);
  });

  it('generates a Jitsi video room when an appointment is confirmed and allows assigned users to join inside the access window', async () => {
    const appointmentId = insertVideoAppointment();

    const updated = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    assert.equal(updated.body.data.appointment.status, 'CONFIRMED');
    assert.equal(
      updated.body.data.appointment.videoRoomUrl,
      `https://meet.jit.si/mediconnect-appointment-${appointmentId}`
    );
    assert.equal(updated.body.data.appointment.videoRoomProvider, 'jitsi');

    const patientRoom = await request(app)
      .get(`/appointments/${appointmentId}/video-room`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(patientRoom.body.success, true);
    assert.equal(patientRoom.body.data.appointmentId, appointmentId);
    assert.equal(patientRoom.body.data.provider, 'jitsi');
    assert.equal(patientRoom.body.data.videoRoomUrl, `https://meet.jit.si/mediconnect-appointment-${appointmentId}`);
    assert.equal(typeof patientRoom.body.data.availableFrom, 'string');
    assert.equal(typeof patientRoom.body.data.availableUntil, 'string');

    const doctorRoom = await request(app)
      .get(`/appointments/${appointmentId}/video-room`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(doctorRoom.body.data.videoRoomUrl, patientRoom.body.data.videoRoomUrl);

    const generatedAudit = await request(app)
      .get('/admin/audit-logs?action=video_room_generated')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(
      generatedAudit.body.data.logs.some((log) => Number(log.entityId) === appointmentId),
      true
    );

    const joinedAudit = await request(app)
      .get('/admin/audit-logs?action=patient_joined_video_call')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(joinedAudit.body.data.logs.some((log) => Number(log.entityId) === appointmentId), true);
  });

  it('does not regenerate an existing video room URL when confirming an appointment', async () => {
    const existingUrl = 'https://meet.jit.si/existing-telehealth-room';
    const appointmentId = insertVideoAppointment({
      videoRoomUrl: existingUrl,
      videoRoomProvider: 'jitsi',
    });

    const updated = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    assert.equal(updated.body.data.appointment.videoRoomUrl, existingUrl);
    assert.equal(updated.body.data.appointment.videoRoomProvider, 'jitsi');
  });

  it('rejects video room access for pending, outside-window, and unauthorized appointments', async () => {
    const pendingAppointmentId = insertVideoAppointment();

    const pendingRoom = await request(app)
      .get(`/appointments/${pendingAppointmentId}/video-room`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(400);
    assert.match(pendingRoom.body.error.message, /confirmed/i);

    const futureAppointmentId = insertVideoAppointment({
      status: 'CONFIRMED',
      offsetMinutes: 24 * 60,
      videoRoomUrl: 'https://meet.jit.si/future-room',
      videoRoomProvider: 'jitsi',
    });

    const futureRoom = await request(app)
      .get(`/appointments/${futureAppointmentId}/video-room`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(400);
    assert.match(futureRoom.body.error.message, /15 minutes/i);

    const otherPatient = patientRegistration({ email: 'video-unrelated@example.com', national_id: '0123456788' });
    await request(app).post('/auth/register').send(otherPatient).expect(201);
    const otherPatientToken = await login(otherPatient.phone, otherPatient.password);

    const unauthorizedRoom = await request(app)
      .get(`/appointments/${futureAppointmentId}/video-room`)
      .set('Authorization', `Bearer ${otherPatientToken}`)
      .expect(403);
    assert.match(unauthorizedRoom.body.error.message, /permission|access/i);

    const deniedAudit = await request(app)
      .get('/admin/audit-logs?action=video_room_access_denied')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(deniedAudit.body.data.logs.some((log) => Number(log.entityId) === futureAppointmentId), true);
  });

  it('returns appointment and patient detail only when the user has access', async () => {
    const secondPatient = patientRegistration({ email: 'routing-patient@example.com', national_id: '0123456796' });
    const registered = await request(app).post('/auth/register').send(secondPatient).expect(201);
    const secondPatientToken = await login(secondPatient.phone, secondPatient.password);
    const secondPatientId = registered.body.data.user.id;

    const appointment = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${secondPatientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-11',
        scheduledTime: '11:30',
        reason: 'Routing context check',
      })
      .expect(201);

    const appointmentDetail = await request(app)
      .get(`/appointments/${appointment.body.data.appointment.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(appointmentDetail.body.data.appointment.patientId, secondPatientId);
    assert.equal(appointmentDetail.body.data.appointment.reason, 'Routing context check');

    const patientDetail = await request(app)
      .get(`/patients/${secondPatientId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(patientDetail.body.data.patient.email, secondPatient.email);
    assert.equal(patientDetail.body.data.patient.password_hash, undefined);

    const unrelatedPatient = patientRegistration({ email: 'routing-unrelated@example.com', national_id: '0123456797' });
    const unrelatedRegistered = await request(app).post('/auth/register').send(unrelatedPatient).expect(201);

    await request(app)
      .get(`/patients/${unrelatedRegistered.body.data.user.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
  });

  it('allows patients to cancel only their own appointments', async () => {
    const created = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-11',
        scheduledTime: '11:00',
        reason: 'Patient cancellation test',
      })
      .expect(201);

    const appointmentId = created.body.data.appointment.id;

    const invalidUpdate = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(403);

    assert.equal(invalidUpdate.body.success, false);

    const cancelled = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'CANCELLED', cancellationReason: 'Feeling better' })
      .expect(200);

    assert.equal(cancelled.body.data.appointment.status, 'CANCELLED');
    assert.equal(cancelled.body.data.appointment.cancellationReason, 'Feeling better');
    assert.equal(cancelled.body.data.appointment.cancelledBy, patientId);
  });

  it('cancels appointments with audit metadata and releases the booked slot', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 1, startTime: '16:00', endTime: '17:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const created = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-18',
        scheduledTime: '16:00',
        reason: 'Cancellation release test',
      })
      .expect(201);

    const appointmentId = created.body.data.appointment.id;

    const lockedSlots = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-18`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(lockedSlots.body.data.slots.map((slot) => slot.time), ['16:30']);

    const cancelled = await request(app)
      .patch(`/appointments/${appointmentId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CANCELLED', cancellationReason: 'Doctor unavailable' })
      .expect(200);

    assert.equal(cancelled.body.data.appointment.status, 'CANCELLED');
    assert.equal(cancelled.body.data.appointment.cancellationReason, 'Doctor unavailable');
    assert.equal(cancelled.body.data.appointment.cancelledBy, doctorId);

    const releasedSlots = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-18`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(releasedSlots.body.data.slots.map((slot) => slot.time), ['16:00', '16:30']);
  });

  it('generates available slots from multiple doctor schedule sessions and removes booked slots', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 2, startTime: '09:00', endTime: '10:00', slotDuration: 30 },
          { weekday: 2, startTime: '13:00', endTime: '14:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const initialSlots = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-12`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(initialSlots.body.data.slots.map((slot) => slot.time), ['09:00', '09:30', '13:00', '13:30']);

    await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-12',
        scheduledTime: '09:00',
        reason: 'Slot lock test',
      })
      .expect(201);

    const afterBooking = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-12`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(afterBooking.body.data.slots.map((slot) => slot.time), ['09:30', '13:00', '13:30']);
  });

  it('rejects overlapping doctor schedule sessions', async () => {
    const response = await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 4, startTime: '09:00', endTime: '11:00', slotDuration: 30 },
          { weekday: 4, startTime: '10:30', endTime: '12:00', slotDuration: 30 },
        ],
      })
      .expect(400);

    assert.match(response.body.error.message, /overlap/i);
  });

  it('blocks booking slots only after admin approves doctor leave requests', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 2, startTime: '15:00', endTime: '16:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    await request(app)
      .post('/leave-requests')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ date: '2026-05-19', reason: 'Personal leave', note: 'Family appointment' })
      .expect(201);

    const pendingSlots = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-19`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(pendingSlots.body.data.slots.map((slot) => slot.time), ['15:00', '15:30']);

    const leaveRequests = await request(app)
      .get('/admin/leave-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const leaveRequest = leaveRequests.body.data.leaveRequests.find((item) => item.date === '2026-05-19');

    assert.equal(leaveRequest.status, 'PENDING');

    const approved = await request(app)
      .post(`/admin/leave-requests/${leaveRequest.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(approved.body.data.leaveRequest.status, 'APPROVED');

    const blockedSlots = await request(app)
      .get(`/doctors/${doctorId}/slots?date=2026-05-19`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.deepEqual(blockedSlots.body.data.slots, []);
  });

  it('prevents patients from managing doctor availability', async () => {
    await request(app)
      .get('/doctors/me/availability')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        availability: [
          { weekday: 2, startTime: '09:00', endTime: '10:00', slotDuration: 30 },
        ],
      })
      .expect(403);
  });

  it('returns duplicate appointment requests idempotently and rejects locked slots', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 3, startTime: '13:00', endTime: '14:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const payload = {
      doctorId,
      scheduledDate: '2026-05-13',
      scheduledTime: '13:00',
      reason: 'Duplicate prevention test',
    };

    const first = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload)
      .expect(201);

    const duplicate = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload)
      .expect(200);

    assert.equal(duplicate.body.data.appointment.id, first.body.data.appointment.id);
    assert.equal(duplicate.body.data.duplicate, true);

    const { getDatabase } = await import('../db/connection.js');
    getDatabase()
      .prepare("UPDATE appointments SET created_at = datetime('now', '-6 seconds') WHERE id = ?")
      .run(first.body.data.appointment.id);

    const rejected = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ ...payload, reason: 'Second attempt outside idempotent shape' })
      .expect(409);

    assert.match(rejected.body.error.message, /unavailable/i);

    await request(app)
      .patch(`/appointments/${first.body.data.appointment.id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CANCELLED', cancellationReason: 'Free slot for duplicate prevention test' })
      .expect(200);

    await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ ...payload, reason: 'Rebook after cancellation' })
      .expect(201);
  });

  it('expires stale pending appointments so slots can be booked again', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 4, startTime: '15:00', endTime: '15:30', slotDuration: 30 },
        ],
      })
      .expect(200);

    const created = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-14',
        scheduledTime: '15:00',
        reason: 'Stale pending test',
      })
      .expect(201);

    const { getDatabase } = await import('../db/connection.js');
    getDatabase()
      .prepare("UPDATE appointments SET created_at = datetime('now', '-31 minutes') WHERE id = ?")
      .run(created.body.data.appointment.id);

    await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-14',
        scheduledTime: '15:00',
        reason: 'Stale pending rebook',
      })
      .expect(201);
  });

  it('creates medical records and uploads local documents', async () => {
    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ title: 'Blood Test Report', category: 'Laboratory', notes: 'CBC panel' })
      .expect(201);

    const recordId = record.body.data.record.id;
    const uploaded = await request(app)
      .post(`/records/${recordId}/upload`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('file', Buffer.from('%PDF demo file'), { filename: 'blood-test.pdf', contentType: 'application/pdf' })
      .expect(201);

    assert.equal(uploaded.body.success, true);
    assert.equal(uploaded.body.data.document.originalName, 'blood-test.pdf');
    assert.match(uploaded.body.data.document.url, /^\/uploads\//);
    assert.equal(uploaded.body.data.document.storageProvider, 'local');
    assert.match(uploaded.body.data.document.storageKey, /blood-test\.pdf$/);

    const listed = await request(app)
      .get('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    const listedRecord = listed.body.data.records.find((item) => item.id === recordId);
    assert.equal(Boolean(listedRecord), true);
    assert.equal(listedRecord.documents.length, 1);
    assert.equal(listedRecord.documents[0].originalName, 'blood-test.pdf');
    assert.equal(listedRecord.documents[0].mimeType, 'application/pdf');
    assert.match(listedRecord.documents[0].url, /^\/uploads\//);
    assert.equal(listedRecord.documents[0].storageProvider, 'local');
  });

  it('exports confirmed appointments as calendar-friendly ICS files', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 1, startTime: '08:00', endTime: '09:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const created = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-11',
        scheduledTime: '08:00',
        reason: 'Calendar export consultation',
      })
      .expect(201);

    await request(app)
      .patch(`/appointments/${created.body.data.appointment.id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const exported = await request(app)
      .get(`/appointments/${created.body.data.appointment.id}/calendar.ics`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.match(exported.headers['content-type'], /text\/calendar/);
    assert.match(exported.text, /BEGIN:VCALENDAR/);
    assert.match(exported.text, /Calendar export consultation/);
    assert.match(exported.text, /STATUS:CONFIRMED/);

    await request(app)
      .get(`/appointments/${created.body.data.appointment.id}/calendar.ics`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
  });

  it('lets patients delete their medical records and removes uploaded files', async () => {
    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ title: 'Delete Flow Report', category: 'Laboratory', notes: 'Delete test' })
      .expect(201);

    const recordId = record.body.data.record.id;
    const upload = await request(app)
      .post(`/records/${recordId}/upload`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('file', Buffer.from('%PDF-1.4 delete test'), {
        filename: 'delete-report.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const documentPath = upload.body.data.document.path;

    assert.equal(fs.existsSync(documentPath), true);

    await request(app)
      .delete(`/records/${recordId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);

    await request(app)
      .delete(`/records/${recordId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.equal(fs.existsSync(documentPath), false);

    const records = await request(app)
      .get('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    assert.equal(records.body.data.records.some((item) => item.id === recordId), false);
  });

  it('lets doctors see documents only for assigned patient records', async () => {
    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ title: 'Doctor Visible X-Ray', category: 'Imaging', notes: 'Shared with assigned doctor' })
      .expect(201);

    const recordId = record.body.data.record.id;

    await request(app)
      .post(`/records/${recordId}/upload`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('file', Buffer.from('fake image'), { filename: 'xray.png', contentType: 'image/png' })
      .expect(201);

    const { getDatabase } = await import('../db/connection.js');
    const db = getDatabase();
    const otherPatientId = Number(
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `).run('Unassigned Patient', 'unassigned@example.com', 'not-used', 'patient').lastInsertRowid,
    );
    const hiddenRecordId = Number(
      db.prepare(`
        INSERT INTO medical_records (patient_id, title, category, notes)
        VALUES (?, ?, ?, ?)
      `).run(otherPatientId, 'Hidden Upload', 'Imaging', 'Doctor should not see this').lastInsertRowid,
    );

    db.prepare(`
      INSERT INTO medical_documents (record_id, filename, original_name, mime_type, size, path, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(hiddenRecordId, 'hidden.png', 'hidden.png', 'image/png', 10, '/tmp/hidden.png', '/uploads/hidden.png');

    const listed = await request(app)
      .get('/records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const visibleRecord = listed.body.data.records.find((item) => item.id === recordId);
    assert.equal(Boolean(visibleRecord), true);
    assert.equal(visibleRecord.documents[0].originalName, 'xray.png');
    assert.equal(listed.body.data.records.some((item) => item.id === hiddenRecordId), false);
  });

  it('prevents patients from accessing another patient record upload route', async () => {
    const otherPatient = patientRegistration({ email: 'other-record-patient@example.com', national_id: '0123456794' });
    await request(app).post('/auth/register').send(otherPatient).expect(201);
    const otherToken = await login(otherPatient.phone, otherPatient.password);

    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ title: 'Private Patient Record', category: 'Laboratory', notes: 'Owner only' })
      .expect(201);

    await request(app)
      .post(`/records/${record.body.data.record.id}/upload`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  it('prevents doctors from seeing unrelated patient records', async () => {
    const unrelatedPatient = patientRegistration({ email: 'unrelated-patient@example.com', national_id: '0123456795' });
    await request(app).post('/auth/register').send(unrelatedPatient).expect(201);
    const unrelatedToken = await login(unrelatedPatient.phone, unrelatedPatient.password);

    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${unrelatedToken}`)
      .send({ title: 'Unrelated Patient Record', category: 'Laboratory', notes: 'No assigned doctor' })
      .expect(201);

    const listed = await request(app)
      .get('/records')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.equal(listed.body.data.records.some((item) => item.id === record.body.data.record.id), false);
  });

  it('rejects unsafe medical document uploads', async () => {
    const record = await request(app)
      .post('/records')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ title: 'Unsafe Upload Test', category: 'Laboratory', notes: 'Should reject executable' })
      .expect(201);

    await request(app)
      .post(`/records/${record.body.data.record.id}/upload`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('file', Buffer.from('bad'), { filename: 'virus.exe', contentType: 'application/octet-stream' })
      .expect(400);
  });

  it('stores and reads patient symptom summaries', async () => {
    const created = await request(app)
      .post('/symptoms')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId,
        mainSymptom: 'Headache and mild fever',
        duration: '2 days',
        fever: 'Yes',
        medication: 'Paracetamol',
        allergies: 'None',
        previousHistory: 'No previous history',
        summary: 'Patient reports headache and mild fever for 2 days.',
      })
      .expect(201);

    assert.equal(created.body.data.symptom.mainSymptom, 'Headache and mild fever');

    const listed = await request(app)
      .get(`/symptoms/patient/${patientId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.ok(listed.body.data.symptoms.length > 0);

    const doctorListed = await request(app)
      .get(`/symptoms/patient/${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    assert.ok(doctorListed.body.data.symptoms.length > 0);
  });

  it('links post-booking chatbot intake to the appointment and creates a medical intake record', async () => {
    const appointmentId = insertVideoAppointment({ status: 'PENDING', offsetMinutes: 45, reason: 'Intake link test' });

    const created = await request(app)
      .post('/symptoms')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId,
        appointmentId,
        mainSymptom: 'Cough and fatigue',
        duration: '3 days',
        fever: 'No',
        medication: 'Cough syrup',
        allergies: 'None',
        previousHistory: 'Asthma',
        summary: 'Patient reports cough and fatigue for 3 days. Chronic disease: Asthma.',
      })
      .expect(201);

    assert.equal(created.body.data.symptom.appointmentId, appointmentId);
    assert.equal(typeof created.body.data.symptom.medicalRecordId, 'number');

    const record = await getDatabase()
      .prepare('SELECT * FROM medical_records WHERE id = ?')
      .get(created.body.data.symptom.medicalRecordId);

    assert.equal(Number(record.patient_id), patientId);
    assert.equal(Number(record.appointment_id), appointmentId);
    assert.match(record.notes, /Cough and fatigue/);
    assert.match(record.notes, /Asthma/);
  });

  it('stores and reads structured symptom summary priority and red flags', async () => {
    const created = await request(app)
      .post('/symptoms')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patientId,
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
      })
      .expect(201);

    assert.equal(created.body.data.symptom.priority, 'HIGH');
    assert.deepEqual(created.body.data.symptom.redFlags, ['chest pain with shortness of breath', 'severe chest pain']);
    assert.equal(created.body.data.symptom.conditionalAnswers['Shortness of breath'], 'Yes');
    assert.match(created.body.data.symptom.doctorSummary, /Priority: HIGH/);

    const listed = await request(app)
      .get(`/symptoms/patient/${patientId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    const structured = listed.body.data.symptoms.find((item) => item.id === created.body.data.symptom.id);
    assert.equal(structured.priority, 'HIGH');
    assert.deepEqual(structured.redFlags, ['chest pain with shortness of breath', 'severe chest pain']);
  });

  it('creates and lists consultation notes', async () => {
    await request(app)
      .put('/doctors/me/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        availability: [
          { weekday: 5, startTime: '14:00', endTime: '15:00', slotDuration: 30 },
        ],
      })
      .expect(200);

    const appointment = await request(app)
      .post('/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId,
        scheduledDate: '2026-05-15',
        scheduledTime: '14:00',
        reason: 'Follow-up consultation',
      })
      .expect(201);

    const created = await request(app)
      .post('/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        appointmentId: appointment.body.data.appointment.id,
        symptoms: 'Headache and mild fever',
        diagnosis: 'Clinical review recorded by doctor',
        prescription: 'Hydration advice',
        advice: 'Rest and monitor symptoms',
        followUp: 'Follow up in three days if needed',
      })
      .expect(201);

    assert.equal(created.body.data.consultation.appointmentId, appointment.body.data.appointment.id);

    const listed = await request(app)
      .get('/consultations')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    assert.ok(listed.body.data.consultations.length > 0);
  });

  it('returns admin summary, users, and appointments only for admins', async () => {
    await request(app)
      .get('/admin/summary')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    const summary = await request(app)
      .get('/admin/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.ok(summary.body.data.summary.totalUsers >= 3);

    const users = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(users.body.data.users.some((user) => user.email === 'doctor@example.com'), true);

    const appointments = await request(app)
      .get('/admin/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(Array.isArray(appointments.body.data.appointments), true);
  });

  it('records audit logs for key events and exposes paginated logs only to admins', async () => {
    await request(app)
      .post('/auth/login')
      .send({ phone: '0900000001', password: 'wrong-password' })
      .expect(401);

    await request(app)
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);

    const logs = await request(app)
      .get('/admin/audit-logs?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(Array.isArray(logs.body.data.logs), true);
    assert.ok(logs.body.data.logs.length <= 5);
    assert.equal(logs.body.data.pagination.page, 1);
    assert.equal(logs.body.data.pagination.limit, 5);
    assert.ok(logs.body.data.pagination.total >= logs.body.data.logs.length);

    const loginFailures = await request(app)
      .get('/admin/audit-logs?action=auth.login.failure&actorRole=anonymous&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(loginFailures.body.data.logs.some((log) => log.action === 'auth.login.failure'), true);
    assert.equal(loginFailures.body.data.logs.every((log) => log.actorRole === 'anonymous'), true);

    const appointmentLogs = await request(app)
      .get('/admin/audit-logs?action=appointment.created&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    assert.equal(appointmentLogs.body.data.logs.some((log) => log.entityType === 'appointment'), true);
  });
});

describe('database adapter schema compatibility', () => {
  it('defines PostgreSQL production schema with serial IDs, timestamps, and JSONB fields', () => {
    const sql = postgresSchemaSql();

    assert.match(sql, /id BIGSERIAL PRIMARY KEY/);
    assert.match(sql, /created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    assert.match(sql, /conditional_answers JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /red_flags JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /metadata_json JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.doesNotMatch(sql, /AUTOINCREMENT/);
    assert.doesNotMatch(sql, /INSERT OR /);
  });
});
