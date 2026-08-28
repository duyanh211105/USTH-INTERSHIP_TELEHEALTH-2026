import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { getDatabase, closeDatabase } from './connection.js';
import { initializeDatabase } from './schema.js';
import { normalizeLocalAppointmentDateTime } from '../utils/appointmentDateTime.js';

dotenv.config();

const demoUsers = [
  {
    name: 'Jane Doe',
    email: 'patient@example.com',
    role: 'patient',
    phone: '0900000001',
    nationalId: '0123456789',
    permanentAddress: '123 Nguyen Trai, District 1, Ho Chi Minh City',
  },
  {
    name: 'Dr. Adrian Clark',
    email: 'doctor@example.com',
    role: 'doctor',
    phone: '0900000002',
    nationalId: null,
    permanentAddress: '',
  },
  {
    name: 'Morgan Lee',
    email: 'admin@example.com',
    role: 'admin',
    phone: '0123456789',
    nationalId: null,
    permanentAddress: '',
  },
];

export async function seedDatabase() {
  await initializeDatabase();
  const db = getDatabase();

  const passwordHash = await bcrypt.hash('password123', 10);
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, national_id, permanent_address, role, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      phone = excluded.phone,
      national_id = excluded.national_id,
      permanent_address = excluded.permanent_address,
      role = excluded.role
  `);

  const ids = {};
  for (const user of demoUsers) {
    await insertUser.run(
      user.name,
      user.email,
      passwordHash,
      user.phone,
      user.nationalId,
      user.permanentAddress,
      user.role,
    );
    ids[user.role] = Number((await getDatabase().prepare('SELECT id FROM users WHERE email = ?').get(user.email)).id);
  }

  await db.prepare(`
    INSERT INTO doctor_profiles (
      user_id, specialty, bio, availability, availability_summary, consultation_fee,
      qualification_title, years_of_experience, gender, languages_spoken,
      rating, average_rating, review_count, patients_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      specialty = excluded.specialty,
      bio = excluded.bio,
      availability = excluded.availability,
      availability_summary = excluded.availability_summary,
      consultation_fee = excluded.consultation_fee,
      qualification_title = excluded.qualification_title,
      years_of_experience = excluded.years_of_experience,
      gender = excluded.gender,
      languages_spoken = excluded.languages_spoken,
      rating = excluded.rating,
      average_rating = excluded.average_rating,
      review_count = excluded.review_count,
      patients_count = excluded.patients_count
  `).run(
    ids.doctor,
    'Cardiology',
    'Telehealth physician focused on asynchronous consultation review.',
    'Mon-Fri, 9:00 AM - 5:00 PM',
    'Mon-Fri, 9:00 AM - 5:00 PM',
    35,
    'SPECIALIST_LEVEL_II',
    12,
    'Male',
    'Vietnamese, English',
    4.9,
    4.9,
    327,
    1240,
  );

  const insertAvailability = db.prepare(`
    INSERT INTO doctor_availability (doctor_id, weekday, start_time, end_time, slot_duration)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(doctor_id, weekday) DO UPDATE SET
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      slot_duration = excluded.slot_duration,
      updated_at = CURRENT_TIMESTAMP
  `);
  const insertSchedule = db.prepare(`
    INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM doctor_schedules
      WHERE doctor_id = ?
        AND weekday = ?
        AND start_time = ?
        AND end_time = ?
        AND slot_duration = ?
    )
  `);

  for (const weekday of [1, 2, 3, 4, 5]) {
    await insertAvailability.run(ids.doctor, weekday, '09:00', '17:00', 30);
    await insertSchedule.run(ids.doctor, weekday, '09:00', '17:00', 30, ids.doctor, weekday, '09:00', '17:00', 30);
  }

  const existingAppointments = Number((await db.prepare('SELECT COUNT(*) AS count FROM appointments').get()).count);
  if (existingAppointments === 0) {
    const appointmentDateTime = normalizeLocalAppointmentDateTime('2026-05-10', '10:30').utcDateTime;
    await db.prepare(`
      INSERT INTO appointments (patient_id, doctor_id, scheduled_date, scheduled_time, appointment_datetime, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ids.patient, ids.doctor, '2026-05-10', '10:30', appointmentDateTime, 'Headache and mild fever for 2 days', 'CONFIRMED');
  }

  const existingRecords = Number((await db.prepare('SELECT COUNT(*) AS count FROM medical_records').get()).count);
  if (existingRecords === 0) {
    await db.prepare(`
      INSERT INTO medical_records (patient_id, title, category, notes)
      VALUES (?, ?, ?, ?)
    `).run(ids.patient, 'Blood Test Report', 'Laboratory', 'CBC panel uploaded for review');
  }

  const existingSymptoms = Number((await db.prepare('SELECT COUNT(*) AS count FROM symptom_summaries').get()).count);
  if (existingSymptoms === 0) {
    await db.prepare(`
      INSERT INTO symptom_summaries (
        patient_id, main_symptom, duration, fever, medication, allergies, previous_history, summary
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ids.patient,
      'Headache and mild fever',
      '2 days',
      'Yes',
      'Paracetamol',
      'None',
      'No previous history',
      'Patient reports headache and mild fever for 2 days.',
    );
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  seedDatabase()
    .then(() => {
      console.log('Database seeded successfully.');
      return closeDatabase();
    })
    .catch((error) => {
      console.error(error);
      closeDatabase().finally(() => process.exit(1));
    });
}
