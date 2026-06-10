import { CalendarClock, CalendarPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import VideoCallButton from '../../components/VideoCallButton.jsx';
import useToast from '../../hooks/useToast.js';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import { createDoctorReview, getAppointmentCalendarUrl, getAppointments } from '../../services/telehealthApi.js';
import { mapAppointmentForView } from '../../services/viewMappers.js';

export default function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [submittingReviewId, setSubmittingReviewId] = useState(null);
  const { toast, showToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setError('');
    getAppointments()
      .then((items) => {
        if (isMounted) {
          setAppointments(items.map(mapAppointmentForView));
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setAppointments([]);
          setError(loadError.message || 'Unable to load appointments.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateReviewDraft(appointmentId, field, value) {
    setReviewDrafts((currentDrafts) => ({
      ...currentDrafts,
      [appointmentId]: {
        rating: '5',
        comment: '',
        ...(currentDrafts[appointmentId] || {}),
        [field]: value,
      },
    }));
  }

  async function handleSubmitReview(appointment) {
    const draft = reviewDrafts[appointment.id] || { rating: '5', comment: '' };

    setSubmittingReviewId(appointment.id);

    try {
      await createDoctorReview(appointment.doctorId, {
        appointmentId: appointment.id,
        rating: Number(draft.rating || 5),
        comment: draft.comment || '',
      });
      showToast('Doctor review submitted.', 'success');
    } catch (reviewError) {
      showToast(reviewError.message || 'Unable to submit doctor review.', 'error');
    } finally {
      setSubmittingReviewId(null);
    }
  }

  return (
    <DashboardLayout
      role="patient"
      title="My Appointments"
      subtitle="Review appointment status, calendar export, and consultation access."
    >
      <div className="mb-5">
        <Toast toast={toast} />
      </div>

      <Card>
        <CardHeader title="All appointments">Appointments are loaded from the backend for the signed-in patient.</CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
              Loading appointments...
            </div>
          ) : null}

          {!isLoading && error ? (
            <EmptyState title="Unable to load appointments" description={error} />
          ) : null}

          {!isLoading && !error && appointments.length === 0 ? (
            <EmptyState title="No appointments yet" description="Book an available doctor slot to start a consultation." />
          ) : null}

          {!isLoading && !error && appointments.length > 0 ? (
            <div className="space-y-3">
              {appointments.map((appointment) => (
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4" key={appointment.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-bold text-slate-950">{appointment.doctor}</h2>
                        <StatusBadge status={appointment.status} />
                      </div>
                      <p className="mt-1 text-sm font-semibold text-medical-700">{appointment.specialty}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <CalendarClock className="h-4 w-4 text-medical-600" aria-hidden="true" />
                        <span>{appointment.date}</span>
                        <span aria-hidden="true">-</span>
                        <span>{appointment.time}</span>
                      </p>
                      {appointment.reason ? <p className="mt-2 text-sm leading-6 text-slate-600">{appointment.reason}</p> : null}
                      {appointment.status === 'COMPLETED' ? (
                        <div className="mt-4 grid gap-3 rounded-lg border border-slate-100 bg-white p-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
                          <label>
                            <span className="text-xs font-bold uppercase text-slate-400">Rating</span>
                            <select
                              className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                              onChange={(event) => updateReviewDraft(appointment.id, 'rating', event.target.value)}
                              value={reviewDrafts[appointment.id]?.rating || '5'}
                            >
                              {[5, 4, 3, 2, 1].map((rating) => (
                                <option key={rating} value={rating}>
                                  {rating} stars
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span className="text-xs font-bold uppercase text-slate-400">Review</span>
                            <input
                              className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                              onChange={(event) => updateReviewDraft(appointment.id, 'comment', event.target.value)}
                              placeholder="Optional written review"
                              value={reviewDrafts[appointment.id]?.comment || ''}
                            />
                          </label>
                          <Button
                            disabled={submittingReviewId === appointment.id}
                            onClick={() => handleSubmitReview(appointment)}
                            size="sm"
                            type="button"
                          >
                            {submittingReviewId === appointment.id ? 'Submitting...' : 'Submit Review'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <VideoCallButton appointment={appointment} showToast={showToast} />
                      <a
                        aria-label="Add appointment to calendar"
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700 hover:shadow-md hover:shadow-medical-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2"
                        download
                        href={getAppointmentCalendarUrl(appointment.id)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                        Add to Calendar
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </DashboardLayout>
  );
}
