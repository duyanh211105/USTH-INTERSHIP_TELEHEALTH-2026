import { CalendarCheck2, CheckCircle2, Clock3, NotebookPen, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { cancelAppointment, getAppointments, updateAppointmentStatus } from '../../services/telehealthApi.js';
import { mapAppointmentForView } from '../../services/viewMappers.js';

export default function DoctorDashboard() {
  const location = useLocation();
  const handledRouteMessageRef = useRef('');
  const [doctorAppointments, setDoctorAppointments] = useState([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState('');
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState(null);
  const [cancellingAppointment, setCancellingAppointment] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const { toast, showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = doctorAppointments.filter((appointment) => appointment.scheduledDate === today);
  const pendingAppointments = doctorAppointments.filter((appointment) => appointment.status === 'PENDING');
  const completedAppointments = doctorAppointments.filter((appointment) => appointment.status === 'COMPLETED');

  useEffect(() => {
    const message = location.state?.doctorWorkflowMessage;

    if (!message || handledRouteMessageRef.current === message) {
      return;
    }

    handledRouteMessageRef.current = message;
    showToast(message, location.state?.doctorWorkflowType || 'error');
  }, [location.state]);

  useEffect(() => {
    let isMounted = true;

    setIsLoadingAppointments(true);
    getAppointments()
      .then((items) => {
        if (isMounted) {
          setDoctorAppointments(items.map(mapAppointmentForView));
          setAppointmentsError('');
        }
      })
      .catch((error) => {
        if (isMounted) {
          setDoctorAppointments([]);
          setAppointmentsError(error.message || 'Unable to load appointments.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingAppointments(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleConfirmAppointment(row) {
    if (updatingAppointmentId) {
      return;
    }

    setUpdatingAppointmentId(row.id);

    try {
      const appointment = await updateAppointmentStatus(row.id, 'CONFIRMED');
      const updatedAppointment = mapAppointmentForView(appointment);

      setDoctorAppointments((currentAppointments) => currentAppointments.map((item) => (
        String(item.id) === String(row.id) ? { ...item, ...updatedAppointment } : item
      )));
      showToast('Appointment confirmed successfully.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to confirm appointment.', 'error');
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  async function handleCancelAppointment() {
    if (!cancellingAppointment || updatingAppointmentId) {
      return;
    }

    if (!cancellationReason.trim()) {
      showToast('Cancellation reason is required.', 'error');
      return;
    }

    setUpdatingAppointmentId(cancellingAppointment.id);

    try {
      const appointment = await cancelAppointment(cancellingAppointment.id, cancellationReason.trim());
      const updatedAppointment = mapAppointmentForView(appointment);

      setDoctorAppointments((currentAppointments) => currentAppointments.map((item) => (
        String(item.id) === String(cancellingAppointment.id) ? { ...item, ...updatedAppointment } : item
      )));
      setCancellingAppointment(null);
      setCancellationReason('');
      showToast('Appointment cancelled successfully.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to cancel appointment.', 'error');
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  return (
    <DashboardLayout role="doctor" title="Doctor Dashboard" subtitle="Review consultation workload and appointment status.">
      <div className="grid gap-5 md:grid-cols-3 xl:gap-6">
        <Card className="min-h-32">
          <CardBody className="flex h-full items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Appointments today</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{todayAppointments.length}</p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-medical-50 text-medical-700">
              <CalendarCheck2 className="h-6 w-6" aria-hidden="true" />
            </span>
          </CardBody>
        </Card>
        <Card className="min-h-32">
          <CardBody className="flex h-full items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Pending review</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{pendingAppointments.length}</p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Clock3 className="h-6 w-6" aria-hidden="true" />
            </span>
          </CardBody>
        </Card>
        <Card className="min-h-32">
          <CardBody className="flex h-full items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Completed</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{completedAppointments.length}</p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-mint-50 text-mint-600">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Today appointments" />
        <CardBody>
          <div className="mb-5">
            <Toast toast={toast} />
          </div>
          <DataTable
            columns={[
              {
                key: 'patient',
                header: 'Patient',
                render: (row) => (
                  <div className="max-w-xs">
                    <Link className="font-semibold text-medical-700 hover:text-medical-600" to={`/doctor/patients/${row.patientId}`}>
                      {row.patient}
                    </Link>
                    <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-500">{row.reason}</p>
                  </div>
                ),
              },
              { key: 'date', header: 'Date' },
              { key: 'time', header: 'Time' },
              {
                key: 'priority',
                header: 'Priority',
                render: (row) => <StatusBadge status={row.priority} />,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      aria-label={`Confirm ${row.patient} appointment`}
                      disabled={updatingAppointmentId === row.id || row.status !== 'PENDING'}
                      onClick={() => handleConfirmAppointment(row)}
                      size="sm"
                      variant="secondary"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {updatingAppointmentId === row.id ? 'Confirming...' : 'Confirm'}
                    </Button>
                    <Link to={`/doctor/consultation/${row.id}`}>
                      <Button size="sm" variant="success">
                        <NotebookPen className="h-4 w-4" aria-hidden="true" />
                        Write note
                      </Button>
                    </Link>
                    <Button
                      disabled={updatingAppointmentId === row.id || row.status === 'CANCELLED'}
                      onClick={() => {
                        setCancellingAppointment(row);
                        setCancellationReason('');
                      }}
                      size="icon"
                      variant="danger"
                      aria-label={`Cancel ${row.patient} appointment`}
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={isLoadingAppointments || appointmentsError ? [] : doctorAppointments}
            getRowKey={(row) => row.id}
          />
          {isLoadingAppointments ? (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
              Loading appointments...
            </div>
          ) : null}
          {!isLoadingAppointments && appointmentsError ? (
            <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {appointmentsError}
            </div>
          ) : null}
          {!isLoadingAppointments && !appointmentsError && doctorAppointments.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No appointments assigned yet" description="Assigned patient appointments will appear here once patients book your available slots." />
            </div>
          ) : null}
        </CardBody>
      </Card>
      {cancellingAppointment ? (
        <ConfirmDialog
          title="Cancel appointment"
          description={`Cancel ${cancellingAppointment.patient}'s appointment and release this booking slot.`}
          confirmLabel="Confirm cancellation"
          isSubmitting={updatingAppointmentId === cancellingAppointment.id}
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
