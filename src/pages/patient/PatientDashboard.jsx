import { CalendarPlus, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Toast from '../../components/Toast.jsx';
import UpcomingAppointments from '../../components/UpcomingAppointments.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { getStoredUser } from '../../services/apiClient.js';
import { getConsultations, getRecords, getUpcomingAppointments } from '../../services/telehealthApi.js';
import { mapAppointmentForView, mapRecordForView } from '../../services/viewMappers.js';

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
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [dashboardRecords, setDashboardRecords] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isLoadingConsultations, setIsLoadingConsultations] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [recordsError, setRecordsError] = useState('');
  const [consultationsError, setConsultationsError] = useState('');
  const latestConsultation = consultations[0] || null;
  const storedUser = getStoredUser();
  const patientName = storedUser?.role === 'patient' ? storedUser.name : 'Patient';
  const { toast, showToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    setIsLoadingAppointments(true);
    setAppointmentsError('');
    getUpcomingAppointments()
      .then((items) => {
        if (isMounted) {
          setUpcomingAppointments(items.map(mapAppointmentForView));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setUpcomingAppointments([]);
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
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr] xl:gap-6">
        <UpcomingAppointments
          appointments={upcomingAppointments}
          error={appointmentsError}
          isLoading={isLoadingAppointments}
          showToast={showToast}
        />

        <Card>
          <CardHeader title="Quick actions">Start the most common patient workflows.</CardHeader>
          <CardBody className="grid gap-3">
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
    </DashboardLayout>
  );
}
