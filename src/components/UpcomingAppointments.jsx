import { CalendarClock, CalendarPlus, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from './Button.jsx';
import Card, { CardBody, CardHeader } from './Card.jsx';
import EmptyState from './EmptyState.jsx';
import StatusBadge from './StatusBadge.jsx';
import VideoCallButton, { getVideoCallWindowState } from './VideoCallButton.jsx';
import { convertUtcToDisplayDateTime, parseLocalAppointmentDateTime } from '../utils/appointmentDateTime.js';

function toAppointmentDateTime(appointment) {
  const date = appointment.appointmentDate || appointment.scheduledDate;
  const time = appointment.appointmentTime || appointment.scheduledTime;

  if (!date || !time) {
    return null;
  }

  return parseLocalAppointmentDateTime(String(date).slice(0, 10), String(time).slice(0, 5));
}

function formatLocalDate(appointment) {
  const display = appointment.appointmentDateTime ? convertUtcToDisplayDateTime(appointment.appointmentDateTime) : null;
  if (display) {
    return display.date;
  }

  const value = toAppointmentDateTime(appointment);

  if (!value) {
    return appointment.appointmentDate || appointment.scheduledDate || 'Date pending';
  }

  return convertUtcToDisplayDateTime(value)?.date || appointment.appointmentDate || appointment.scheduledDate || 'Date pending';
}

function formatLocalTime(appointment) {
  const display = appointment.appointmentDateTime ? convertUtcToDisplayDateTime(appointment.appointmentDateTime) : null;
  if (display) {
    return display.time;
  }

  const value = toAppointmentDateTime(appointment);

  if (!value) {
    return appointment.appointmentTime || appointment.scheduledTime || 'Time pending';
  }

  return convertUtcToDisplayDateTime(value)?.time || appointment.appointmentTime || appointment.scheduledTime || 'Time pending';
}

function normalizeAppointment(appointment) {
  return {
    ...appointment,
    id: appointment.id || appointment.appointmentId,
    appointmentDateTime: appointment.appointmentDateTime,
    scheduledDate: appointment.scheduledDate || appointment.appointmentDate,
    scheduledTime: appointment.scheduledTime || appointment.appointmentTime,
  };
}

export default function UpcomingAppointments({
  appointments,
  error,
  isLoading,
  showToast,
  title = 'Upcoming Appointments',
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Link to="/patient/appointments">
            <Button size="sm" variant="secondary">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              View All Appointments
            </Button>
          </Link>
        }
      >
        Next confirmed or pending appointments, sorted by nearest appointment time.
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
            Loading upcoming appointments...
          </div>
        ) : null}

        {!isLoading && error ? (
          <EmptyState title="Unable to load upcoming appointments" description={error} />
        ) : null}

        {!isLoading && !error && appointments.length === 0 ? (
          <EmptyState title="No upcoming appointments." description="Book an available doctor slot to start a telehealth consultation." />
        ) : null}

        {!isLoading && !error && appointments.length > 0 ? (
          <div className="space-y-3">
            {appointments.map((item) => {
              const appointment = normalizeAppointment(item);
              const videoState = getVideoCallWindowState(appointment);
              const showJoinButton = appointment.status === 'CONFIRMED' && videoState.isAvailable;

              return (
                <div
                  className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-medical-100 hover:bg-white hover:shadow-soft"
                  key={appointment.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-slate-950">{appointment.doctorName || appointment.doctor || 'Doctor'}</h3>
                        <StatusBadge status={appointment.status} />
                      </div>
                      <p className="mt-1 text-sm font-semibold text-medical-700">{appointment.specialty || 'Telehealth'}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <CalendarClock className="h-4 w-4 text-medical-600" aria-hidden="true" />
                        <span>{formatLocalDate(appointment)}</span>
                        <span aria-hidden="true">-</span>
                        <span>{formatLocalTime(appointment)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {showJoinButton ? <VideoCallButton appointment={appointment} showToast={showToast} /> : null}
                      <Link to="/patient/appointments">
                        <Button size="sm" variant="secondary">
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
