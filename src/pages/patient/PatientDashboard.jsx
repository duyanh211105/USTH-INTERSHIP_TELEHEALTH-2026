import { Bot, CalendarPlus, FileText, UploadCloud, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import VideoCallButton from '../../components/VideoCallButton.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { getStoredUser } from '../../services/apiClient.js';
import { cancelAppointment, getAppointmentCalendarUrl, getAppointments, getConsultations, getRecords } from '../../services/telehealthApi.js';
import { mapAppointmentForView, mapRecordForView } from '../../services/viewMappers.js';

function MetricCard({ label, value, helper, icon: Icon, tone, to }) {
  const content = (
    <Card as={to ? 'div' : 'section'} className={`min-h-32 ${to ? 'cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:border-medical-100 hover:shadow-lg' : ''}`}>
      <CardBody className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      </CardBody>
    </Card>
  );

  if (!to) {
    return content;
  }

  return (
    <Link aria-label={`${label} statistic card`} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-500 focus:ring-offset-2" to={to}>
      {content}
    </Link>
  );
}

function formatDate(value) {
  if (!value) {
    return 'Date pending';
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

export default function PatientDashboard() {
  const [dashboardAppointments, setDashboardAppointments] = useState([]);
  const [dashboardRecords, setDashboardRecords] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isLoadingConsultations, setIsLoadingConsultations] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [consultationsError, setConsultationsError] = useState('');
  const [cancellingAppointment, setCancellingAppointment] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const upcomingAppointment = dashboardAppointments.find((appointment) => appointment.status !== 'CANCELLED') || null;
  const latestConsultation = consultations[0] || null;
  const storedUser = getStoredUser();
  const patientName = storedUser?.role === 'patient' ? storedUser.name : 'Patient';
  const { toast, showToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    setIsLoadingAppointments(true);
    setAppointmentsError('');
    getAppointments()
      .then((items) => {
        if (isMounted) {
          setDashboardAppointments(items.map(mapAppointmentForView));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setDashboardAppointments([]);
          setAppointmentsError(error.message || 'Unable to load appointments.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingAppointments(false);
        }
      });

    setIsLoadingRecords(true);
    setRecordsError('');
    getRecords()
      .then((items) => {
        if (isMounted) {
          setDashboardRecords(items.map(mapRecordForView));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setDashboardRecords([]);
          setRecordsError(error.message || 'Unable to load medical records.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingRecords(false);
        }
      });

    setIsLoadingConsultations(true);
    setConsultationsError('');
    getConsultations()
      .then((items) => {
        if (isMounted) {
          setConsultations(items);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setConsultations([]);
          setConsultationsError(error.message || 'Unable to load consultation results.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingConsultations(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCancelAppointment() {
    if (!cancellingAppointment) {
      return;
    }

    if (!cancellationReason.trim()) {
      showToast('Cancellation reason is required.', 'error');
      return;
    }

    setIsCancelling(true);

    try {
      const appointment = await cancelAppointment(cancellingAppointment.id, cancellationReason.trim());
      const updatedAppointment = mapAppointmentForView(appointment);
      setDashboardAppointments((currentAppointments) => currentAppointments.map((item) => (
        Number(item.id) === Number(updatedAppointment.id) ? { ...item, ...updatedAppointment } : item
      )));
      setCancellingAppointment(null);
      setCancellationReason('');
      showToast('Appointment cancelled successfully.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to cancel appointment.', 'error');
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <DashboardLayout
      role="patient"
      title="Patient Dashboard"
      subtitle={`Welcome back, ${patientName}. Your telehealth overview is ready.`}
      actions={
        <Link to="/patient/book">
          <Button size="sm">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Book appointment
          </Button>
        </Link>
      }
    >
      <div className="mb-5">
        <Toast toast={toast} />
      </div>
      <div className="grid gap-5 md:grid-cols-3 xl:gap-6">
        <MetricCard
          label="Appointments"
          value={isLoadingAppointments ? '...' : dashboardAppointments.length}
          helper={appointmentsError || `${dashboardAppointments.filter((appointment) => appointment.status !== 'CANCELLED').length} active appointments`}
          icon={CalendarPlus}
          tone="bg-medical-50 text-medical-700"
          to="/patient/book"
        />
        <MetricCard
          label="Medical Records"
          value={isLoadingRecords ? '...' : dashboardRecords.length}
          helper={recordsError || `${dashboardRecords.length} uploaded records`}
          icon={FileText}
          tone="bg-mint-50 text-mint-600"
          to="/patient/records"
        />
        <MetricCard
          label="Consultation Results"
          value={isLoadingConsultations ? '...' : consultations.length}
          helper={consultationsError || (latestConsultation ? `Latest: ${formatDate(latestConsultation.createdAt)}` : 'No results yet')}
          icon={UploadCloud}
          tone="bg-amber-50 text-amber-700"
          to="/patient/result"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.75fr] xl:gap-6">
        <Card>
          <CardHeader
            title="Upcoming appointment"
            action={
              upcomingAppointment ? <StatusBadge status={upcomingAppointment.status} /> : null
            }
          >
            Remote consultation details and current appointment status.
          </CardHeader>
          <CardBody>
            {isLoadingAppointments ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading appointments...
              </div>
            ) : null}

            {!isLoadingAppointments && appointmentsError ? (
              <EmptyState title="Unable to load appointments" description={appointmentsError} />
            ) : null}

            {!isLoadingAppointments && !appointmentsError && !upcomingAppointment ? (
              <EmptyState title="No upcoming appointments" description="Book an available doctor slot to start a telehealth consultation." />
            ) : null}

            {!isLoadingAppointments && !appointmentsError && upcomingAppointment ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-sm font-semibold text-slate-500">Doctor</p>
                    <p className="mt-1 text-lg font-bold text-slate-950">{upcomingAppointment.doctor}</p>
                    <p className="text-sm text-slate-500">{upcomingAppointment.specialty}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-sm font-semibold text-slate-500">Schedule</p>
                    <p className="mt-1 text-lg font-bold text-slate-950">{upcomingAppointment.date}</p>
                    <p className="text-sm text-slate-500">{upcomingAppointment.time}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-700">Reason</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{upcomingAppointment.reason}</p>
                </div>
                {upcomingAppointment.status !== 'CANCELLED' ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <VideoCallButton appointment={upcomingAppointment} showToast={showToast} />
                    <a
                      aria-label="Add upcoming appointment to calendar"
                      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700 hover:shadow-md hover:shadow-medical-600/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 focus-visible:ring-offset-2"
                      download
                      href={getAppointmentCalendarUrl(upcomingAppointment.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                      Add to Calendar
                    </a>
                    <Button onClick={() => setCancellingAppointment(upcomingAppointment)} variant="danger">
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      Cancel appointment
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions">Start the most common patient workflows.</CardHeader>
          <CardBody className="grid gap-3">
            <Link to="/patient/chatbot">
              <Button className="w-full justify-start" variant="secondary">
                <Bot className="h-4 w-4" aria-hidden="true" />
                Open symptom chatbot
              </Button>
            </Link>
            <Link to="/patient/book">
              <Button className="w-full justify-start" variant="secondary">
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Book appointment
              </Button>
            </Link>
            <Link to="/patient/records">
              <Button className="w-full justify-start" variant="secondary">
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                Upload record
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2 xl:gap-6">
        <Card>
          <CardHeader title="Recent medical records" />
          <CardBody className="space-y-3">
            {isLoadingRecords ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading medical records...
              </div>
            ) : null}

            {!isLoadingRecords && recordsError ? (
              <EmptyState title="Unable to load medical records" description={recordsError} />
            ) : null}

            {!isLoadingRecords && !recordsError && dashboardRecords.length === 0 ? (
              <EmptyState title="No medical records uploaded yet" description="Upload medical documents so your doctor can review them." />
            ) : null}

            {!isLoadingRecords && !recordsError ? dashboardRecords.slice(0, 3).map((record) => (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/40 p-4" key={record.id}>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{record.title}</p>
                  <p className="text-sm text-slate-500">{record.category} - {record.date}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{record.type}</span>
              </div>
            )) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Latest consultation result" action={<Link className="text-sm font-semibold text-medical-700" to="/patient/result">View result</Link>} />
          <CardBody>
            {isLoadingConsultations ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading consultation result...
              </div>
            ) : null}

            {!isLoadingConsultations && consultationsError ? (
              <EmptyState title="Unable to load consultation results" description={consultationsError} />
            ) : null}

            {!isLoadingConsultations && !consultationsError && !latestConsultation ? (
              <EmptyState title="No consultation results yet" description="Doctor notes will appear here after your consultation." />
            ) : null}

            {!isLoadingConsultations && !consultationsError && latestConsultation ? (
              <>
                <p className="text-sm font-semibold text-slate-500">
                  {formatDate(latestConsultation.createdAt)} - {latestConsultation.doctorName || 'Doctor'}
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">{latestConsultation.diagnosis || 'Consultation note'}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{latestConsultation.advice || 'No advice recorded.'}</p>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>
      {cancellingAppointment ? (
        <ConfirmDialog
          title="Cancel appointment"
          description="Cancel this appointment and release the booking slot."
          confirmLabel="Confirm cancellation"
          isSubmitting={isCancelling}
          onCancel={() => {
            setCancellingAppointment(null);
            setCancellationReason('');
          }}
          onConfirm={handleCancelAppointment}
        >
          <label>
            <span className="text-sm font-semibold text-slate-700">Cancellation reason</span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
              onChange={(event) => setCancellationReason(event.target.value)}
              value={cancellationReason}
            />
          </label>
        </ConfirmDialog>
      ) : null}
    </DashboardLayout>
  );
}
