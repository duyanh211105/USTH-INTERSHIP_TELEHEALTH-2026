import { CalendarDays, Stethoscope, UserRound, Users, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { cancelAppointment, getAdminSummary, getAppointments } from '../../services/telehealthApi.js';
import { mapAppointmentForView } from '../../services/viewMappers.js';

function Metric({ label, value, icon: Icon, tone }) {
  return (
    <Card>
      <CardBody className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
        </div>
        <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      </CardBody>
    </Card>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [appointmentsError, setAppointmentsError] = useState('');
  const [cancellingAppointment, setCancellingAppointment] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast, showToast } = useToast();
  const totalRoleCount = (metrics?.totalPatients || 0) + (metrics?.totalDoctors || 0);
  const roleBreakdown = [
    { role: 'Patients', count: metrics?.totalPatients || 0 },
    { role: 'Doctors', count: metrics?.totalDoctors || 0 },
    { role: 'Admins', count: Math.max((metrics?.totalUsers || 0) - totalRoleCount, 0) },
  ].map((item) => ({
    ...item,
    percentage: metrics?.totalUsers ? `${Math.round((item.count / metrics.totalUsers) * 100)}%` : '0%',
  }));

  useEffect(() => {
    let isMounted = true;

    setIsLoadingMetrics(true);
    setMetricsError('');
    getAdminSummary()
      .then((summary) => {
        if (isMounted && summary) {
          setMetrics(summary);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setMetrics(null);
          setMetricsError(error.message || 'Unable to load admin summary.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingMetrics(false);
        }
      });

    setIsLoadingAppointments(true);
    setAppointmentsError('');
    getAppointments()
      .then((items) => {
        if (isMounted) {
          setAdminAppointments(items.map(mapAppointmentForView));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setAdminAppointments([]);
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
      setAdminAppointments((currentAppointments) => currentAppointments.map((item) => (
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
    <DashboardLayout role="admin" title="Admin Dashboard" subtitle="System overview for users, doctors, patients, and appointments.">
      <div className="mb-5">
        <Toast toast={toast} />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        <Metric label="Total users" value={isLoadingMetrics ? '...' : metrics?.totalUsers ?? 0} icon={Users} tone="bg-medical-50 text-medical-700" />
        <Metric label="Total doctors" value={isLoadingMetrics ? '...' : metrics?.totalDoctors ?? 0} icon={Stethoscope} tone="bg-mint-50 text-mint-600" />
        <Metric label="Total patients" value={isLoadingMetrics ? '...' : metrics?.totalPatients ?? 0} icon={UserRound} tone="bg-amber-50 text-amber-700" />
        <Metric label="Total appointments" value={isLoadingMetrics ? '...' : metrics?.totalAppointments ?? 0} icon={CalendarDays} tone="bg-rose-50 text-rose-700" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr] xl:gap-6">
        <Card>
          <CardHeader title="Users by role" />
          <CardBody className="space-y-4">
            {isLoadingMetrics ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading role summary...
              </div>
            ) : null}

            {!isLoadingMetrics && metricsError ? (
              <EmptyState title="Unable to load admin summary" description={metricsError} />
            ) : null}

            {!isLoadingMetrics && !metricsError ? roleBreakdown.map((item) => (
              <div key={item.role}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">{item.role}</span>
                  <span className="font-bold text-slate-950">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-medical-600" style={{ width: item.percentage }} />
                </div>
              </div>
            )) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appointment table" />
          <CardBody>
            {isLoadingAppointments ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading appointments...
              </div>
            ) : null}

            {!isLoadingAppointments && appointmentsError ? (
              <EmptyState title="Unable to load appointments" description={appointmentsError} />
            ) : null}

            {!isLoadingAppointments && !appointmentsError && adminAppointments.length === 0 ? (
              <EmptyState title="No appointments found" description="System appointments will appear here after patients book consultations." />
            ) : null}

            {!isLoadingAppointments && !appointmentsError && adminAppointments.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'patient', header: 'Patient' },
                  { key: 'doctor', header: 'Doctor' },
                  { key: 'date', header: 'Date' },
                  { key: 'time', header: 'Time' },
                  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  {
                    key: 'actions',
                    header: 'Actions',
                    render: (row) => (
                      <Button
                        aria-label={`Cancel ${row.patient} appointment`}
                        disabled={row.status === 'CANCELLED'}
                        onClick={() => setCancellingAppointment(row)}
                        size="sm"
                        variant="danger"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Cancel
                      </Button>
                    ),
                  },
                ]}
                rows={adminAppointments}
                getRowKey={(row) => row.id}
              />
            ) : null}
          </CardBody>
        </Card>
      </div>
      {cancellingAppointment ? (
        <ConfirmDialog
          title="Cancel appointment"
          description={`Cancel ${cancellingAppointment.patient}'s appointment and release this booking slot.`}
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
