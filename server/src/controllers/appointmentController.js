import {
  createAppointment,
  getAppointmentForUser,
  getAppointmentVideoRoomForUser,
  listAppointmentsForUser,
  updateAppointmentStatus,
} from '../services/appointmentService.js';
import { createAuditLog } from '../services/auditService.js';
import { generateAppointmentCalendar } from '../services/calendarService.js';
import { sendSuccess } from '../services/responseService.js';

export async function getAppointments(req, res) {
  return sendSuccess(res, { appointments: await listAppointmentsForUser(req.user) });
}

export async function getAppointment(req, res) {
  return sendSuccess(res, { appointment: await getAppointmentForUser(req.user, req.params.id) });
}

export async function getAppointmentCalendar(req, res) {
  const calendar = await generateAppointmentCalendar(req.user, req.params.id);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${calendar.filename}"`);
  return res.status(200).send(calendar.content);
}

export async function getAppointmentVideoRoom(req, res) {
  try {
    const videoRoom = await getAppointmentVideoRoomForUser(req.user, req.params.id, {
      ipAddress: req.ip,
    });

    await createAuditLog({
      actor: req.user,
      action: req.user.role === 'doctor' ? 'doctor_joined_video_call' : 'patient_joined_video_call',
      entityType: 'appointment',
      entityId: videoRoom.appointmentId,
      metadata: {
        provider: videoRoom.provider,
      },
      ipAddress: req.ip,
    });

    return sendSuccess(res, videoRoom);
  } catch (error) {
    if ([400, 403].includes(error.status)) {
      await createAuditLog({
        actor: req.user,
        action: 'video_room_access_denied',
        entityType: 'appointment',
        entityId: Number(req.params.id) || null,
        metadata: {
          reason: error.message,
          status: error.status,
        },
        ipAddress: req.ip,
      });
    }

    throw error;
  }
}

export async function postAppointment(req, res) {
  const result = await createAppointment(req.user, req.body);
  await createAuditLog({
    actor: req.user,
    action: result.duplicate ? 'appointment.duplicate' : 'appointment.created',
    entityType: 'appointment',
    entityId: result.appointment.id,
    metadata: {
      doctorId: result.appointment.doctorId,
      scheduledDate: result.appointment.scheduledDate,
      scheduledTime: result.appointment.scheduledTime,
      duplicate: result.duplicate,
    },
    ipAddress: req.ip,
  });
  return sendSuccess(res, result, result.duplicate ? 200 : 201);
}

export async function patchAppointmentStatus(req, res) {
  const appointment = await updateAppointmentStatus(req.user, req.params.id, req.body.status, {
    ...req.body,
    ipAddress: req.ip,
  });
  const statusAction = {
    CONFIRMED: 'appointment.confirmed',
    COMPLETED: 'appointment.completed',
    CANCELLED: 'appointment.cancelled',
  }[appointment.status] || 'appointment.updated';
  await createAuditLog({
    actor: req.user,
    action: statusAction,
    entityType: 'appointment',
    entityId: appointment.id,
    metadata: {
      status: appointment.status,
      cancellationReason: appointment.cancellationReason,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
    },
    ipAddress: req.ip,
  });
  return sendSuccess(res, { appointment });
}
