import { CalendarPlus, ClipboardCheck, Pill, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Toast from '../../components/Toast.jsx';
import VideoCallButton from '../../components/VideoCallButton.jsx';
import useToast from '../../hooks/useToast.js';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import { getAppointment, getAppointmentCalendarUrl, getConsultations } from '../../services/telehealthApi.js';

function formatDate(value) {
  if (!value) {
    return 'Consultation date pending';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default function ConsultationResultPage() {
  const [consultations, setConsultations] = useState([]);
  const [latestAppointment, setLatestAppointment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, showToast } = useToast();
  const latestConsultation = consultations[0] || null;
  const sections = useMemo(() => {
    if (!latestConsultation) {
      return [];
    }

    return [
      { label: 'Diagnosis', value: latestConsultation.diagnosis || 'Not provided', icon: Stethoscope },
      { label: 'Prescription', value: latestConsultation.prescription || 'Not provided', icon: Pill },
      { label: 'Advice', value: latestConsultation.advice || 'Not provided', icon: ClipboardCheck },
      { label: 'Follow-up', value: latestConsultation.followUp || latestConsultation.follow_up || 'Not provided', icon: ClipboardCheck },
    ];
  }, [latestConsultation]);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setError('');
    async function loadConsultations() {
      try {
        const items = await getConsultations();
        if (isMounted) {
          setConsultations(items);
        }

        const appointmentId = items[0]?.appointmentId;
        if (!appointmentId) {
          if (isMounted) {
            setLatestAppointment(null);
          }
          return;
        }

        const appointment = await getAppointment(appointmentId).catch(() => null);
        if (isMounted) {
          setLatestAppointment(appointment);
        }
      } catch (loadError) {
        if (isMounted) {
          setConsultations([]);
          setLatestAppointment(null);
          setError(loadError.message || 'Unable to load consultation results.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadConsultations();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <DashboardLayout
      role="patient"
      title="Patient Consultation Result"
      subtitle="Doctor-reviewed diagnosis, prescription, advice, and follow-up."
      actions={
        latestConsultation?.appointmentId ? (
          <a
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700 hover:shadow-md hover:shadow-medical-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2"
            download
            href={getAppointmentCalendarUrl(latestConsultation.appointmentId)}
            rel="noreferrer"
            target="_blank"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Add to Calendar
          </a>
        ) : null
      }
    >
      <Card>
        <CardHeader
          title="Consultation result"
          eyebrow={latestConsultation ? `${formatDate(latestConsultation.createdAt)} - ${latestConsultation.doctorName || 'Doctor'}` : 'Latest doctor note'}
        />
        <CardBody>
          <div className="mb-5">
            <Toast toast={toast} />
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
              Loading consultation results...
            </div>
          ) : null}

          {!isLoading && error ? (
            <EmptyState title="Unable to load consultation results" description={error} />
          ) : null}

          {!isLoading && !error && !latestConsultation ? (
            <EmptyState title="No consultation results yet" description="Your doctor consultation notes will appear here after an appointment is completed." />
          ) : null}

          {!isLoading && !error && latestConsultation ? (
            <>
              {latestAppointment ? (
                <div className="mb-5">
                  <VideoCallButton appointment={latestAppointment} showToast={showToast} />
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {sections.map((section) => {
                  const Icon = section.icon;

                  return (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-4" key={section.label}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-50 text-mint-600">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h2 className="font-bold text-slate-950">{section.label}</h2>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{section.value}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </DashboardLayout>
  );
}
