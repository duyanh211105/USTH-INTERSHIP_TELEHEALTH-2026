import { getDatabase } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapReview(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    reviewId: Number(row.id),
    appointmentId: Number(row.appointment_id),
    patientId: Number(row.patient_id),
    doctorId: Number(row.doctor_id),
    rating: Number(row.rating),
    comment: row.comment || '',
    createdAt: toIsoString(row.created_at),
  };
}

export async function createDoctorReview(user, doctorId, data) {
  if (user.role !== 'patient') {
    throw new ApiError(403, 'Only patients can review doctors');
  }

  const appointmentId = Number(data.appointmentId || data.appointment_id);
  const rating = Number(data.rating);
  const comment = String(data.comment || '').trim();

  if (!appointmentId) {
    throw new ApiError(400, 'appointmentId is required');
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be an integer from 1 to 5');
  }

  const db = getDatabase();
  return db.transaction(async (transactionDb) => {
    const appointment = await transactionDb
      .prepare(`
        SELECT id, patient_id, doctor_id, status
        FROM appointments
        WHERE id = ?
      `)
      .get(appointmentId);

    if (!appointment) {
      throw new ApiError(404, 'Appointment not found');
    }

    if (Number(appointment.patient_id) !== Number(user.id) || Number(appointment.doctor_id) !== Number(doctorId)) {
      throw new ApiError(403, 'Patients can only review doctors from their own completed appointments');
    }

    if (appointment.status !== 'COMPLETED') {
      throw new ApiError(400, 'Doctor reviews are allowed only after a completed consultation');
    }

    const existingReview = await transactionDb
      .prepare('SELECT id FROM doctor_reviews WHERE appointment_id = ?')
      .get(appointmentId);

    if (existingReview) {
      throw new ApiError(409, 'This appointment has already been reviewed');
    }

    const result = await transactionDb
      .prepare(`
        INSERT INTO doctor_reviews (appointment_id, patient_id, doctor_id, rating, comment)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(appointmentId, user.id, doctorId, rating, comment);

    const aggregate = await transactionDb
      .prepare(`
        SELECT AVG(rating) AS average_rating, COUNT(*) AS review_count
        FROM doctor_reviews
        WHERE doctor_id = ?
      `)
      .get(doctorId);

    await transactionDb
      .prepare(`
        UPDATE doctor_profiles
        SET average_rating = ?,
            rating = ?,
            review_count = ?
        WHERE user_id = ?
      `)
      .run(Number(aggregate.average_rating || 0), Number(aggregate.average_rating || 0), Number(aggregate.review_count || 0), doctorId);

    return mapReview(
      await transactionDb
        .prepare('SELECT * FROM doctor_reviews WHERE id = ?')
        .get(Number(result.lastInsertRowid)),
    );
  });
}
