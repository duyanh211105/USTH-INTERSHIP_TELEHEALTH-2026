import { Ban, CheckCircle2, Edit3, Filter, Plus, Stethoscope, UserPlus, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import { DOCTOR_QUALIFICATIONS, getQualificationLabel, normalizeQualificationCode } from '../../constants/doctorQualifications.js';
import { SPECIALTIES, getSpecialtyLabel, normalizeSpecialtyCode } from '../../constants/specialties.js';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { getStoredUser } from '../../services/apiClient.js';
import {
  createAdminDoctor,
  approveAdminLeaveRequest,
  deleteAdminDoctor,
  getAdminDoctors,
  getAdminLeaveRequests,
  rejectAdminLeaveRequest,
  updateAdminDoctor,
  updateUserStatus,
} from '../../services/telehealthApi.js';

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  qualification_title: '',
  specialty: '',
  phone: '',
  bio: '',
  consultation_fee: '',
  years_of_experience: '',
  gender: '',
  languages_spoken: '',
};

const emptyLeaveFilters = {
  department: '',
  doctorName: '',
  status: '',
  date: '',
};

function doctorAvailability(doctor) {
  return doctor.availabilitySummary || doctor.availability || 'Schedule not set';
}

function doctorFee(doctor) {
  const value = doctor.consultationFee ?? doctor.consultation_fee;

  if (value === undefined || value === null || value === '') {
    return '$0';
  }

  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function doctorSpecialty(doctor) {
  return getSpecialtyLabel(doctor.specialtyCode || doctor.specialty);
}

function doctorQualification(doctor) {
  return getQualificationLabel(doctor.qualificationCode || doctor.qualificationTitle || doctor.qualification_title);
}

export default function AdminDoctorManagementPage() {
  const storedUser = getStoredUser();
  const canManageDoctors = storedUser?.role === 'admin';
  const [doctors, setDoctors] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveFilters, setLeaveFilters] = useState(() => ({
    ...emptyLeaveFilters,
    status: canManageDoctors ? '' : 'PENDING',
  }));
  const [form, setForm] = useState(emptyForm);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLeaveRequests, setIsLoadingLeaveRequests] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [leaveUpdatingId, setLeaveUpdatingId] = useState(null);
  const [deletingDoctor, setDeletingDoctor] = useState(null);
  const { toast, showToast } = useToast();

  const activeDoctors = useMemo(() => doctors.filter((doctor) => doctor.status !== 'INACTIVE').length, [doctors]);
  const pageTitle = canManageDoctors ? 'Doctor Management' : 'Leave Approval';
  const pageSubtitle = canManageDoctors
    ? 'Create, update, and deactivate doctor accounts.'
    : 'Review medical staff leave requests allowed by your role and department.';

  useEffect(() => {
    let isMounted = true;

    if (canManageDoctors) {
      getAdminDoctors()
        .then((items) => {
          if (isMounted) {
            setDoctors(items);
          }
        })
        .catch((error) => {
          if (isMounted) {
            showToast(error.message || 'Unable to load doctors.', 'error');
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    } else {
      setIsLoading(false);
    }

    setIsLoadingLeaveRequests(true);
    getAdminLeaveRequests(leaveFilters)
      .then((items) => {
        if (isMounted) {
          setLeaveRequests(items);
        }
      })
      .catch((error) => {
        if (isMounted) {
          showToast(error.message || 'Unable to load leave requests.', 'error');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingLeaveRequests(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateLeaveFilter(field, value) {
    setLeaveFilters((current) => ({ ...current, [field]: value }));
  }

  async function loadLeaveRequests(filters = leaveFilters) {
    setIsLoadingLeaveRequests(true);

    try {
      const items = await getAdminLeaveRequests(filters);
      setLeaveRequests(items);
    } catch (error) {
      showToast(error.message || 'Unable to load leave requests.', 'error');
    } finally {
      setIsLoadingLeaveRequests(false);
    }
  }

  function handleLeaveSearch(event) {
    event.preventDefault();
    loadLeaveRequests(leaveFilters);
  }

  function clearLeaveFilters() {
    const nextFilters = {
      ...emptyLeaveFilters,
      status: canManageDoctors ? '' : 'PENDING',
    };
    setLeaveFilters(nextFilters);
    loadLeaveRequests(nextFilters);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingDoctor(null);
  }

  function startEdit(doctor) {
    setEditingDoctor(doctor);
    setForm({
      full_name: doctor.name || '',
      email: doctor.email || '',
      password: '',
      qualification_title: normalizeQualificationCode(doctor.qualificationCode || doctor.qualificationTitle || doctor.qualification_title),
      specialty: normalizeSpecialtyCode(doctor.specialtyCode || doctor.specialty),
      phone: doctor.phone || '',
      bio: doctor.bio || '',
      consultation_fee: String(doctor.consultationFee ?? doctor.consultation_fee ?? ''),
      years_of_experience: String(doctor.yearsOfExperience ?? doctor.years_of_experience ?? ''),
      gender: doctor.gender || '',
      languages_spoken: doctor.languagesSpoken || doctor.languages_spoken || '',
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.full_name.trim() || !form.email.trim() || !form.specialty.trim() || !form.qualification_title.trim()) {
      showToast('Full name, email, specialty, and qualification are required.', 'error');
      return;
    }

    if (!editingDoctor && !form.password) {
      showToast('Password is required when creating a doctor.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        qualification_title: form.qualification_title.trim(),
        specialty: form.specialty.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        consultation_fee: Number(form.consultation_fee || 0),
        years_of_experience: Number(form.years_of_experience || 0),
        gender: form.gender.trim(),
        languages_spoken: form.languages_spoken.trim(),
      };

      if (editingDoctor) {
        const { password, ...updatePayload } = payload;
        const updatedDoctor = await updateAdminDoctor(editingDoctor.id, updatePayload);
        setDoctors((current) => current.map((doctor) => (
          Number(doctor.id) === Number(editingDoctor.id) ? updatedDoctor : doctor
        )));
        showToast('Doctor profile updated.', 'success');
      } else {
        const createdDoctor = await createAdminDoctor(payload);
        setDoctors((current) => [createdDoctor, ...current]);
        showToast('Doctor account created.', 'success');
      }

      resetForm();
    } catch (error) {
      showToast(error.message || 'Unable to save doctor account.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(doctor, status) {
    setStatusUpdatingId(doctor.id);

    try {
      const user = await updateUserStatus(doctor.id, status);
      setDoctors((current) => current.map((item) => (
        Number(item.id) === Number(doctor.id) ? { ...item, status: user.status } : item
      )));
      showToast(status === 'ACTIVE' ? 'Doctor account reactivated.' : 'Doctor account deactivated.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to update doctor account.', 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  }

  async function handleDeleteDoctor() {
    if (!deletingDoctor) {
      return;
    }

    setStatusUpdatingId(deletingDoctor.id);

    try {
      const doctor = await deleteAdminDoctor(deletingDoctor.id);
      setDoctors((current) => current.map((item) => (
        Number(item.id) === Number(deletingDoctor.id) ? { ...item, status: doctor.status } : item
      )));
      setDeletingDoctor(null);
      showToast('Doctor deleted.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to delete doctor.', 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  }

  async function handleLeaveDecision(leaveRequest, action) {
    setLeaveUpdatingId(leaveRequest.id);

    try {
      const rejectionReason = action === 'reject'
        ? window.prompt('Rejection reason', leaveRequest.rejectionReason || '') || ''
        : '';
      const updatedRequest = action === 'approve'
        ? await approveAdminLeaveRequest(leaveRequest.id)
        : await rejectAdminLeaveRequest(leaveRequest.id, rejectionReason);

      setLeaveRequests((currentItems) => currentItems.map((item) => (
        Number(item.id) === Number(updatedRequest.id) ? updatedRequest : item
      )));
      showToast(action === 'approve' ? 'Leave request approved.' : 'Leave request rejected.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to update leave request.', 'error');
    } finally {
      setLeaveUpdatingId(null);
    }
  }

  return (
    <DashboardLayout role="admin" title={pageTitle} subtitle={pageSubtitle}>
      {canManageDoctors ? (
      <div className="grid gap-5 xl:grid-cols-[420px_1fr] xl:gap-6">
        <Card>
          <CardHeader
            title={editingDoctor ? 'Edit doctor profile' : 'Create doctor account'}
            eyebrow="Admin tools"
            action={
              <span className="inline-flex items-center gap-2 rounded-full bg-medical-50 px-3 py-1 text-xs font-bold text-medical-700">
                <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
                {activeDoctors} active
              </span>
            }
          >
            Manage the user account and doctor profile in one workflow.
          </CardHeader>
          <CardBody>
            <div className="mb-5">
              <Toast toast={toast} />
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label>
                <span className="text-sm font-semibold text-slate-700">Full name</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => updateField('full_name', event.target.value)}
                  placeholder="Dr. Linh Tran"
                  value={form.full_name}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Email</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('email', event.target.value)}
                    placeholder="doctor@example.com"
                    type="email"
                    value={form.email}
                  />
                </label>

                <label>
                  <span className="text-sm font-semibold text-slate-700">Password</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder={editingDoctor ? 'Leave blank to keep current password' : 'Temporary password'}
                    type="password"
                    value={form.password}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Qualification</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('qualification_title', event.target.value)}
                    value={form.qualification_title}
                  >
                    <option value="">Select qualification</option>
                    {DOCTOR_QUALIFICATIONS.map((qualification) => (
                      <option key={qualification.value} value={qualification.value}>
                        {qualification.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-semibold text-slate-700">Specialty</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('specialty', event.target.value)}
                    value={form.specialty}
                  >
                    <option value="">Select specialty</option>
                    {SPECIALTIES.map((specialty) => (
                      <option key={specialty.value} value={specialty.value}>
                        {specialty.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-semibold text-slate-700">Phone</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('phone', event.target.value)}
                    placeholder="0911111111"
                    value={form.phone}
                  />
                </label>
              </div>

              <label>
                <span className="text-sm font-semibold text-slate-700">Bio</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => updateField('bio', event.target.value)}
                  placeholder="Short professional profile"
                  value={form.bio}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Consultation fee</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    min="0"
                    onChange={(event) => updateField('consultation_fee', event.target.value)}
                    placeholder="50"
                    type="number"
                    value={form.consultation_fee}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Years of experience</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    min="0"
                    onChange={(event) => updateField('years_of_experience', event.target.value)}
                    placeholder="10"
                    type="number"
                    value={form.years_of_experience}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Gender</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('gender', event.target.value)}
                    value={form.gender}
                  >
                    <option value="">Not specified</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Languages spoken</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => updateField('languages_spoken', event.target.value)}
                    placeholder="Vietnamese, English"
                    value={form.languages_spoken}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="w-full sm:w-auto" type="submit" disabled={isSubmitting}>
                  {editingDoctor ? <Edit3 className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
                  {isSubmitting ? 'Saving doctor...' : editingDoctor ? 'Update doctor' : 'Create doctor'}
                </Button>
                {editingDoctor ? (
                  <Button className="w-full sm:w-auto" onClick={resetForm} type="button" variant="secondary">
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Doctor list"
            action={
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {doctors.length} total
              </span>
            }
          >
            Active doctors are available to patients during appointment booking.
          </CardHeader>
          <CardBody>
            {isLoading ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Loading doctors...
              </div>
            ) : doctors.length === 0 ? (
              <EmptyState title="No doctors yet" description="Create a doctor account to make them available for booking." />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'doctor',
                    header: 'Doctor',
                    render: (row) => (
                      <div className="max-w-xs">
                        <p className="font-bold text-slate-950">{row.name}</p>
                        <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-500">{doctorQualification(row)} - {row.email}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'specialty',
                    header: 'Specialty',
                    render: (row) => (
                      <span className="inline-flex rounded-full bg-medical-50 px-2.5 py-1 text-xs font-bold text-medical-700 ring-1 ring-medical-100">
                        {doctorSpecialty(row)}
                      </span>
                    ),
                  },
                  {
                    key: 'availability',
                    header: 'Availability',
                    render: (row) => <span className="text-slate-600">{doctorAvailability(row)}</span>,
                  },
                  {
                    key: 'fee',
                    header: 'Fee',
                    render: (row) => <span className="font-semibold text-slate-900">{doctorFee(row)}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => <StatusBadge status={row.status || 'ACTIVE'} />,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    render: (row) => (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => startEdit(row)} size="sm" variant="secondary">
                          <Edit3 className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Button>
                        {row.status === 'INACTIVE' ? (
                          <Button
                            aria-label={`Reactivate ${row.name}`}
                            disabled={statusUpdatingId === row.id}
                            onClick={() => handleStatusChange(row, 'ACTIVE')}
                            size="sm"
                            variant="success"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            {statusUpdatingId === row.id ? 'Updating...' : 'Reactivate'}
                          </Button>
                        ) : (
                          <Button
                            aria-label={`Deactivate ${row.name}`}
                            disabled={row.status === 'DELETED' || statusUpdatingId === row.id}
                            onClick={() => handleStatusChange(row, 'INACTIVE')}
                            size="sm"
                            variant="danger"
                          >
                            <Ban className="h-4 w-4" aria-hidden="true" />
                            {statusUpdatingId === row.id ? 'Updating...' : 'Deactivate'}
                          </Button>
                        )}
                        <Button
                          aria-label={`Delete ${row.name}`}
                          disabled={row.status === 'DELETED' || statusUpdatingId === row.id}
                          onClick={() => setDeletingDoctor(row)}
                          size="sm"
                          variant="danger"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={doctors}
                getRowKey={(row) => row.id}
              />
            )}
          </CardBody>
        </Card>
      </div>
      ) : null}

      <Card className={canManageDoctors ? 'mt-6' : ''}>
        <CardHeader title="Leave approvals" eyebrow="Doctor schedule workflow">
          Department heads review their own department. Hospital directors can review all departments below them.
        </CardHeader>
        <CardBody>
          <form className="mb-5 grid gap-4 rounded-lg border border-slate-100 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleLeaveSearch}>
            <label>
              <span className="text-sm font-semibold text-slate-700">Department</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateLeaveFilter('department', event.target.value)}
                value={leaveFilters.department}
              >
                <option value="">All departments</option>
                {SPECIALTIES.map((specialty) => (
                  <option key={specialty.value} value={specialty.value}>
                    Department of {specialty.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">Doctor name</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateLeaveFilter('doctorName', event.target.value)}
                placeholder="Search by name"
                value={leaveFilters.doctorName}
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateLeaveFilter('status', event.target.value)}
                value={leaveFilters.status}
              >
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-700">Leave date</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                onChange={(event) => updateLeaveFilter('date', event.target.value)}
                type="date"
                value={leaveFilters.date}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button className="h-11" type="submit" disabled={isLoadingLeaveRequests}>
                <Filter className="h-4 w-4" aria-hidden="true" />
                {isLoadingLeaveRequests ? 'Loading...' : 'Filter'}
              </Button>
              <Button className="h-11" type="button" variant="secondary" onClick={clearLeaveFilters}>
                Clear
              </Button>
            </div>
          </form>

          {isLoadingLeaveRequests ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
              Loading leave requests...
            </div>
          ) : leaveRequests.length === 0 ? (
            <EmptyState title="No leave requests pending review" description="Doctor leave requests will appear here for approval or rejection." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'doctor',
                  header: 'Doctor',
                  render: (row) => (
                    <div className="max-w-xs">
                      <p className="font-bold text-slate-950">{row.doctorName}</p>
                      <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-500">
                        {row.departmentName || 'Department not set'} - {row.doctorRole || 'doctor'}
                      </p>
                      <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-500">{row.note || 'No additional note'}</p>
                    </div>
                  ),
                },
                { key: 'date', header: 'Date' },
                { key: 'reason', header: 'Reason' },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        aria-label={`Approve ${row.reason} leave request`}
                        disabled={row.status !== 'PENDING' || leaveUpdatingId === row.id}
                        onClick={() => handleLeaveDecision(row, 'approve')}
                        size="sm"
                        variant="success"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {leaveUpdatingId === row.id ? 'Updating...' : 'Approve'}
                      </Button>
                      <Button
                        aria-label={`Reject ${row.reason} leave request`}
                        disabled={row.status !== 'PENDING' || leaveUpdatingId === row.id}
                        onClick={() => handleLeaveDecision(row, 'reject')}
                        size="sm"
                        variant="danger"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Reject
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={leaveRequests}
              getRowKey={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
      {deletingDoctor ? (
        <ConfirmDialog
          title="Delete doctor"
          description={`Delete ${deletingDoctor.name} from active doctor management. Historical appointments will remain.`}
          confirmLabel="Confirm delete doctor"
          isSubmitting={statusUpdatingId === deletingDoctor.id}
          onCancel={() => setDeletingDoctor(null)}
          onConfirm={handleDeleteDoctor}
        />
      ) : null}
    </DashboardLayout>
  );
}
