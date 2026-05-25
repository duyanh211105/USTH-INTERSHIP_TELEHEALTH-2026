import { CalendarPlus, Clock, Filter, Stethoscope } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { createAppointment, getDoctorSlots, getDoctors } from '../../services/telehealthApi.js';
import { mapDoctorForView } from '../../services/viewMappers.js';

export default function BookAppointmentPage() {
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [scheduledDate, setScheduledDate] = useState('2026-05-07');
  const [scheduledTime, setScheduledTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [doctorFilters, setDoctorFilters] = useState({
    q: '',
    specialty: '',
    minFee: '',
    maxFee: '',
  });
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [reason, setReason] = useState('Headache and mild fever for 2 days. Requesting remote consultation.');
  const [doctorLoadError, setDoctorLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const { toast, showToast } = useToast();
  const doctor = availableDoctors.find((item) => String(item.id) === String(selectedDoctor)) || null;

  function loadDoctors(filters = doctorFilters, date = scheduledDate) {
    setIsLoadingDoctors(true);
    setDoctorLoadError('');

    return getDoctors({ ...filters, date })
      .then((items) => {
        const mappedDoctors = items.map(mapDoctorForView);
        setAvailableDoctors(mappedDoctors);
        setSelectedDoctor((currentDoctorId) => (
          mappedDoctors.some((item) => String(item.id) === String(currentDoctorId))
            ? currentDoctorId
            : mappedDoctors[0]?.id || ''
        ));
      })
      .catch((error) => {
        setAvailableDoctors([]);
        setSelectedDoctor('');
        setDoctorLoadError(error.message || 'Unable to load doctors.');
        showToast(error.message || 'Unable to load doctors.', 'error');
      })
      .finally(() => {
        setIsLoadingDoctors(false);
      });
  }

  useEffect(() => {
    let isMounted = true;

    loadDoctors(doctorFilters, scheduledDate).finally(() => {
      if (!isMounted) {
        return;
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDoctor || Number.isNaN(Number(selectedDoctor))) {
      setSlots([]);
      setScheduledTime('');
      return undefined;
    }

    let isMounted = true;
    setIsLoadingSlots(true);

    getDoctorSlots(selectedDoctor, scheduledDate)
      .then((items) => {
        if (!isMounted) {
          return;
        }

        setSlots(items);
        setScheduledTime(items[0]?.time || '');

        if (items.length === 0) {
          showToast('No available slots for this doctor and date.', 'warning');
        }
      })
      .catch((error) => {
        if (isMounted) {
          setSlots([]);
          setScheduledTime('');
          showToast(error.message || 'Unable to load available slots.', 'error');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSlots(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDoctor, scheduledDate]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    if (!scheduledTime) {
      showToast('Selected appointment slot is unavailable.', 'warning');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await createAppointment({
        doctorId: Number(selectedDoctor),
        scheduledDate,
        scheduledTime,
        reason,
      });

      if (result.duplicate) {
        showToast('This appointment request was already submitted.', 'warning');
      } else {
        showToast('Appointment booked successfully.', 'success');
      }

      const refreshedSlots = await getDoctorSlots(selectedDoctor, scheduledDate);
      setSlots(refreshedSlots);
      setScheduledTime(refreshedSlots[0]?.time || '');
    } catch {
      showToast('Selected appointment slot is unavailable or the API request failed.', 'error');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function handleFilterChange(field, value) {
    setDoctorFilters((currentFilters) => ({ ...currentFilters, [field]: value }));
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    loadDoctors(doctorFilters, scheduledDate);
  }

  function handleClearFilters() {
    const nextFilters = { q: '', specialty: '', minFee: '', maxFee: '' };
    setDoctorFilters(nextFilters);
    loadDoctors(nextFilters, scheduledDate);
  }

  return (
    <DashboardLayout role="patient" title="Book Appointment" subtitle="Schedule a remote consultation with a specialist.">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px] xl:gap-6">
        <Card>
          <CardHeader title="Appointment details" eyebrow="New request" />
          <CardBody>
            <div className="mb-5">
              <Toast toast={toast} />
            </div>
            <form className="mb-5 rounded-lg border border-slate-100 bg-slate-50/60 p-4" onSubmit={handleApplyFilters}>
              <div className="grid gap-4 md:grid-cols-4">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Doctor name</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('q', event.target.value)}
                    placeholder="Search by name"
                    value={doctorFilters.q}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Specialty</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('specialty', event.target.value)}
                    placeholder="Cardiology"
                    value={doctorFilters.specialty}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Minimum fee</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    min="0"
                    onChange={(event) => handleFilterChange('minFee', event.target.value)}
                    placeholder="0"
                    type="number"
                    value={doctorFilters.minFee}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Maximum fee</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    min="0"
                    onChange={(event) => handleFilterChange('maxFee', event.target.value)}
                    placeholder="100"
                    type="number"
                    value={doctorFilters.maxFee}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button size="sm" type="submit" disabled={isLoadingDoctors}>
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  {isLoadingDoctors ? 'Filtering doctors...' : 'Apply doctor filters'}
                </Button>
                <Button size="sm" type="button" variant="secondary" onClick={handleClearFilters} disabled={isLoadingDoctors}>
                  Clear filters
                </Button>
              </div>
            </form>
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <label>
                <span className="text-sm font-semibold text-slate-700">Doctor</span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setSelectedDoctor(event.target.value)}
                  disabled={isLoadingDoctors || availableDoctors.length === 0}
                  value={selectedDoctor}
                >
                  {isLoadingDoctors ? <option value="">Loading doctors...</option> : null}
                  {!isLoadingDoctors && availableDoctors.length === 0 ? <option value="">No active doctors available</option> : null}
                  {availableDoctors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.specialty}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Date</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => setScheduledDate(event.target.value)}
                    type="date"
                    value={scheduledDate}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Time</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => setScheduledTime(event.target.value)}
                    disabled={isLoadingSlots || slots.length === 0}
                    value={scheduledTime}
                  >
                    {isLoadingSlots ? <option value="">Loading slots...</option> : null}
                    {!isLoadingSlots && slots.length === 0 ? <option value="">No available slots</option> : null}
                    {slots.map((slot) => (
                      <option key={slot.time} value={slot.time}>
                        {slot.time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span className="text-sm font-semibold text-slate-700">Reason</span>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </label>

              <Button className="w-full sm:w-auto" type="submit" disabled={isSubmitting || isLoadingDoctors || isLoadingSlots || !selectedDoctor || !scheduledTime}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                {isSubmitting ? 'Creating appointment...' : 'Create pending appointment'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Selected doctor" action={<StatusBadge status="PENDING" />} />
          <CardBody>
            {isLoadingDoctors ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold text-slate-500">
                Loading selected doctor...
              </div>
            ) : null}

            {!isLoadingDoctors && doctorLoadError ? (
              <EmptyState title="Unable to load doctors" description={doctorLoadError} />
            ) : null}

            {!isLoadingDoctors && !doctorLoadError && !doctor ? (
              <EmptyState title="No active doctors available" description="Ask an admin to create or reactivate a doctor before booking an appointment." />
            ) : null}

            {!isLoadingDoctors && !doctorLoadError && doctor ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-medical-50 text-medical-700">
                    <Stethoscope className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">{doctor.name}</h2>
                    <p className="text-sm text-slate-500">{doctor.specialty}</p>
                  </div>
                </div>
                <dl className="mt-6 grid gap-3 text-sm">
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="flex items-center gap-2 font-semibold text-slate-600">
                      <Clock className="h-4 w-4 text-medical-600" aria-hidden="true" />
                      Availability
                    </dt>
                    <dd className="font-bold text-slate-900">{doctor.availability}</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="font-semibold text-slate-600">Rating</dt>
                    <dd className="font-bold text-slate-900">{doctor.rating}/5</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="font-semibold text-slate-600">Patients</dt>
                    <dd className="font-bold text-slate-900">{doctor.patients}</dd>
                  </div>
                </dl>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}
