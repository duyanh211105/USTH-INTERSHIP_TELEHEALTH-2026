import { ArrowLeft, CalendarPlus, Save, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import VideoCallButton from '../../components/VideoCallButton.jsx';
import useToast from '../../hooks/useToast.js';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import { createConsultation, getAppointment, getAppointmentCalendarUrl, getSymptomsForPatient } from '../../services/telehealthApi.js';
import { mapAppointmentForView } from '../../services/viewMappers.js';

const emptyNote = {
  symptoms: '',
  diagnosis: '',
  prescription: '',
  advice: '',
  followUp: '',
};

const noteFields = [
  ['symptoms', 'Symptoms'],
  ['diagnosis', 'Diagnosis'],
  ['prescription', 'Prescription'],
  ['advice', 'Advice'],
  ['followUp', 'Follow-up'],
];

function getRouteAccessMessage(error) {
  if (error.status === 403) {
    return 'You do not have permission to access this resource.';
  }

  if (error.status === 404) {
    return 'Patient or appointment not found.';
  }

  return error.message || 'Unable to load consultation context.';
}

async function loadConsultationContext(appointmentId) {
  const item = await getAppointment(appointmentId);
  const mappedAppointment = mapAppointmentForView(item);
  const symptomItems = await getSymptomsForPatient(mappedAppointment.patientId).catch(() => []);

  return { mappedAppointment, symptomItems };
}

export default function ConsultationNotePage() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const submitInFlightRef = useRef(false);
  const [appointment, setAppointment] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const [note, setNote] = useState(emptyNote);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast, showToast } = useToast();

  const latestSymptomSummary = useMemo(
    () => symptoms[0]?.summary || 'No symptom summary submitted yet.',
    [symptoms],
  );

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setPageError('');
    loadConsultationContext(appointmentId)
      .then(({ mappedAppointment, symptomItems }) => {
        if (!isMounted) {
          return;
        }

        setAppointment(mappedAppointment);
        setSymptoms(symptomItems);
        setNote((currentNote) => ({
          ...currentNote,
          symptoms: currentNote.symptoms || symptomItems[0]?.summary || mappedAppointment.reason || '',
        }));
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setAppointment(null);
        setSymptoms([]);
        setNote(emptyNote);

        if (error.status === 403 || error.status === 404) {
          navigate('/doctor', {
            replace: true,
            state: {
              doctorWorkflowMessage: getRouteAccessMessage(error),
              doctorWorkflowType: 'error',
            },
          });
          return;
        }

        setPageError(getRouteAccessMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [appointmentId, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!appointment || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      await createConsultation({
        appointmentId: appointment.id,
        symptoms: note.symptoms,
        diagnosis: note.diagnosis,
        prescription: note.prescription,
        advice: note.advice,
        followUp: note.followUp,
      });
      const { mappedAppointment, symptomItems } = await loadConsultationContext(appointmentId);

      setAppointment(mappedAppointment);
      setSymptoms(symptomItems);
      showToast('Consultation note saved.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to save consultation note.', 'error');
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="doctor" title="Consultation Note" subtitle="Document diagnosis, prescription, advice, and follow-up instructions.">
      {isLoading ? (
        <Card>
          <CardBody>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
              Loading consultation context...
            </div>
          </CardBody>
        </Card>
      ) : null}

      {!isLoading && pageError ? (
        <Card>
          <CardHeader title={pageError} />
          <CardBody>
            <p className="text-sm leading-6 text-slate-600">
              This appointment either does not exist or is not assigned to your doctor account.
            </p>
            <Link className="mt-4 inline-flex" to="/doctor">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {!isLoading && !pageError && appointment ? (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr] xl:gap-6">
          <Card>
            <CardHeader title="Consultation context" action={<StatusBadge status={appointment.status} />} />
            <CardBody className="space-y-4">
              <Link to={`/doctor/patients/${appointment.patientId}`}>
                <Button size="sm" variant="secondary">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to Patient Detail
                </Button>
              </Link>
              {appointment.status !== 'CANCELLED' ? (
                <div className="flex flex-wrap items-start gap-3">
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
                  <VideoCallButton appointment={appointment} showToast={showToast} />
                </div>
              ) : null}
              <div>
                <p className="text-sm font-semibold text-slate-500">Patient</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{appointment.patient}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-700">Appointment reason</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{appointment.reason}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-700">Symptoms submitted</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{latestSymptomSummary}</p>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-mint-50 p-4 text-mint-600">
                <Stethoscope className="h-5 w-5" aria-hidden="true" />
                <p className="text-sm font-semibold">Saving this note marks the appointment as completed.</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Doctor note form" eyebrow="Asynchronous consultation" />
            <CardBody>
              <div className="mb-5">
                <Toast toast={toast} />
              </div>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                {noteFields.map(([key, label]) => (
                  <label key={label}>
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                      onChange={(event) => setNote((currentNote) => ({ ...currentNote, [key]: event.target.value }))}
                      value={note[key]}
                    />
                  </label>
                ))}
                <Button className="w-full sm:w-auto" type="submit" disabled={isSubmitting}>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {isSubmitting ? 'Saving consultation note...' : 'Save consultation note'}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
