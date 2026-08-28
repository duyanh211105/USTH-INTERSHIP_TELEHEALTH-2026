import { BadgeCheck, CalendarDays, CalendarPlus, Clock, DollarSign, Filter, Search, SlidersHorizontal, Star, Stethoscope, Users, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button.jsx';
import Card, { CardBody, CardHeader } from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Toast from '../../components/Toast.jsx';
import { DOCTOR_QUALIFICATIONS } from '../../constants/doctorQualifications.js';
import { SPECIALTIES } from '../../constants/specialties.js';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import useToast from '../../hooks/useToast.js';
import { getStoredUser } from '../../services/apiClient.js';
import { createAppointment, createSymptomSummary, getDoctorSlots, getDoctors } from '../../services/telehealthApi.js';
import { mapDoctorForView } from '../../services/viewMappers.js';
import { getCurrentLocalDate } from '../../utils/appointmentDateTime.js';

const DOCTOR_FILTER_STORAGE_KEY = 'mediconnect_doctor_filters';
const DEFAULT_DOCTOR_FILTERS = {
  q: '',
  specialty: '',
  date: '',
  minFee: '',
  maxFee: '',
  qualificationTitle: '',
  availableNext3Days: false,
  availableThisWeek: false,
  minExperience: '',
  minRating: '',
  gender: '',
  language: '',
  availableToday: false,
  videoAvailable: false,
  consultationType: '',
  sort: 'recommended',
};

const RATING_OPTIONS = [
  { value: '', label: 'Any rating' },
  { value: '4', label: '4+' },
  { value: '4.5', label: '4.5+' },
  { value: '4.8', label: '4.8+' },
];

const LANGUAGE_OPTIONS = [
  { value: '', label: 'Any language' },
  { value: 'Vietnamese', label: 'Vietnamese' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'Chinese', label: 'Chinese' },
];

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'highest_rating', label: 'Highest Rating' },
  { value: 'most_experienced', label: 'Most Experienced' },
  { value: 'earliest_availability', label: 'Earliest Available' },
  { value: 'lowest_fee', label: 'Lowest Fee' },
  { value: 'highest_fee', label: 'Highest Fee' },
  { value: 'most_reviewed', label: 'Most Reviewed' },
];

const INTAKE_QUESTIONS = [
  { key: 'mainSymptom', label: 'Symptoms', prompt: 'What symptoms are you experiencing?' },
  { key: 'duration', label: 'Duration', prompt: 'How long have you had these symptoms?' },
  { key: 'medication', label: 'Medication', prompt: 'Have you taken any medication?' },
  { key: 'allergies', label: 'Allergies', prompt: 'Do you have allergies?' },
  { key: 'chronicDiseases', label: 'Chronic diseases', prompt: 'Do you have any chronic diseases?' },
];

const EMPTY_INTAKE_ANSWERS = {
  mainSymptom: '',
  duration: '',
  medication: '',
  allergies: '',
  chronicDiseases: '',
};

function getTodayUtcDate() {
  return getCurrentLocalDate();
}

function buildIntakeSummary(answers) {
  return [
    `Patient reports: ${answers.mainSymptom || 'Not provided'}.`,
    `Duration: ${answers.duration || 'Not provided'}.`,
    `Medication taken: ${answers.medication || 'Not provided'}.`,
    `Allergies: ${answers.allergies || 'Not provided'}.`,
    `Chronic diseases: ${answers.chronicDiseases || 'Not provided'}.`,
  ].join(' ');
}

function readStoredDoctorFilters() {
  try {
    const storedFilters = sessionStorage.getItem(DOCTOR_FILTER_STORAGE_KEY);
    return storedFilters ? { ...DEFAULT_DOCTOR_FILTERS, ...JSON.parse(storedFilters) } : DEFAULT_DOCTOR_FILTERS;
  } catch {
    return DEFAULT_DOCTOR_FILTERS;
  }
}

function buildDoctorSearchParams(filters) {
  const hasSpecificDate = Boolean(filters.date);

  return {
    q: filters.q,
    specialty: filters.specialty,
    date: filters.date,
    minFee: filters.minFee,
    maxFee: filters.maxFee,
    qualificationTitle: filters.qualificationTitle,
    availableThisWeek: !hasSpecificDate && filters.availableThisWeek ? true : undefined,
    minExperience: filters.minExperience,
    minRating: filters.minRating,
    gender: filters.gender,
    language: filters.language,
    availableToday: !hasSpecificDate && filters.availableToday ? true : undefined,
    videoAvailable: filters.videoAvailable ? true : undefined,
    consultationType: filters.consultationType,
    sort: filters.sort || 'recommended',
    page: 1,
    limit: 20,
  };
}

function formatDoctorFee(value) {
  if (value === undefined || value === null || value === '') {
    return '$0';
  }

  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function BookAppointmentPage() {
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [scheduledDate, setScheduledDate] = useState(getTodayUtcDate);
  const [scheduledTime, setScheduledTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [doctorFilters, setDoctorFilters] = useState(readStoredDoctorFilters);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [reason, setReason] = useState('Headache and mild fever for 2 days. Requesting remote consultation.');
  const [doctorLoadError, setDoctorLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookedAppointment, setBookedAppointment] = useState(null);
  const [showIntake, setShowIntake] = useState(false);
  const [intakeAnswers, setIntakeAnswers] = useState(EMPTY_INTAKE_ANSWERS);
  const [intakeStep, setIntakeStep] = useState(0);
  const [intakeError, setIntakeError] = useState('');
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [isIntakeSaved, setIsIntakeSaved] = useState(false);
  const isSubmittingRef = useRef(false);
  const { toast, showToast } = useToast();
  const doctor = availableDoctors.find((item) => String(item.id) === String(selectedDoctor)) || null;

  function loadDoctors(filters = doctorFilters) {
    setIsLoadingDoctors(true);
    setDoctorLoadError('');

    return getDoctors(buildDoctorSearchParams(filters))
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

    loadDoctors(doctorFilters).finally(() => {
      if (!isMounted) {
        return;
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DOCTOR_FILTER_STORAGE_KEY, JSON.stringify(doctorFilters));
  }, [doctorFilters]);

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
    setShowIntake(false);
    setBookedAppointment(null);
    setIntakeError('');
    setIsIntakeSaved(false);

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
        setBookedAppointment(result.appointment);
        setIntakeAnswers(EMPTY_INTAKE_ANSWERS);
        setIntakeStep(0);
        setShowIntake(true);
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

  function handleIntakeAnswer(value) {
    const currentQuestion = INTAKE_QUESTIONS[intakeStep];
    setIntakeAnswers((currentAnswers) => ({ ...currentAnswers, [currentQuestion.key]: value }));
    setIntakeError('');
  }

  async function handleIntakeNext() {
    const currentQuestion = INTAKE_QUESTIONS[intakeStep];
    const currentAnswer = intakeAnswers[currentQuestion.key].trim();

    if (!currentAnswer) {
      setIntakeError('Please answer this intake question before continuing.');
      return;
    }

    if (intakeStep < INTAKE_QUESTIONS.length - 1) {
      setIntakeStep((currentStep) => currentStep + 1);
      setIntakeError('');
      return;
    }

    if (!bookedAppointment || isSavingIntake) {
      return;
    }

    setIsSavingIntake(true);
    setIntakeError('');

    try {
      const summary = buildIntakeSummary(intakeAnswers);
      const storedUser = getStoredUser();

      await createSymptomSummary({
        patientId: storedUser?.id,
        appointmentId: bookedAppointment.id,
        mainSymptom: intakeAnswers.mainSymptom,
        duration: intakeAnswers.duration,
        fever: 'Not reported during appointment intake',
        medication: intakeAnswers.medication,
        allergies: intakeAnswers.allergies,
        previousHistory: intakeAnswers.chronicDiseases,
        summary,
        doctorSummary: summary,
      });

      setIsIntakeSaved(true);
      showToast('Medical intake saved to this appointment record.', 'success');
    } catch (error) {
      setIntakeError(error.message || 'Unable to save medical intake.');
      showToast(error.message || 'Unable to save medical intake.', 'error');
    } finally {
      setIsSavingIntake(false);
    }
  }

  function handleFilterChange(field, value) {
    setDoctorFilters((currentFilters) => {
      const nextFilters = { ...currentFilters, [field]: value };

      if (field === 'date' && value) {
        nextFilters.availableToday = false;
        nextFilters.availableThisWeek = false;
        nextFilters.availableNext3Days = false;
      }

      if (field === 'availableToday' && value) {
        nextFilters.date = '';
        nextFilters.availableThisWeek = false;
        nextFilters.availableNext3Days = false;
      }

      if (field === 'availableThisWeek' && value) {
        nextFilters.date = '';
        nextFilters.availableToday = false;
        nextFilters.availableNext3Days = false;
      }

      return nextFilters;
    });
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    loadDoctors(doctorFilters);
  }

  function handleClearFilters() {
    const nextFilters = DEFAULT_DOCTOR_FILTERS;
    setDoctorFilters(nextFilters);
    setShowAdvancedFilters(false);
    loadDoctors(nextFilters);
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('specialty', event.target.value)}
                    value={doctorFilters.specialty}
                  >
                    <option value="">All specialties</option>
                    {SPECIALTIES.map((specialty) => (
                      <option key={specialty.value} value={specialty.value}>
                        {specialty.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Qualification</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('qualificationTitle', event.target.value)}
                    value={doctorFilters.qualificationTitle}
                  >
                    <option value="">All qualifications</option>
                    {DOCTOR_QUALIFICATIONS.map((qualification) => (
                      <option key={qualification.value} value={qualification.value}>
                        {qualification.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Available date</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('date', event.target.value)}
                    type="date"
                    value={doctorFilters.date}
                  />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Consultation Type</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('consultationType', event.target.value)}
                    value={doctorFilters.consultationType}
                  >
                    <option value="">Any consultation</option>
                    <option value="video">Video Consultation</option>
                    <option value="in_person" disabled>In-person Consultation - Coming Soon</option>
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-700">Sort by</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleFilterChange('sort', event.target.value)}
                    value={doctorFilters.sort}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {showAdvancedFilters ? (
                <div className="mt-4 grid gap-4 rounded-lg border border-slate-100 bg-white/80 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                  <label>
                    <span className="text-sm font-semibold text-slate-700">Minimum experience</span>
                    <input
                      className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                      min="0"
                      onChange={(event) => handleFilterChange('minExperience', event.target.value)}
                      placeholder="5 years"
                      type="number"
                      value={doctorFilters.minExperience}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-700">Minimum rating</span>
                    <select
                      className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                      onChange={(event) => handleFilterChange('minRating', event.target.value)}
                      value={doctorFilters.minRating}
                    >
                      {RATING_OPTIONS.map((option) => (
                        <option key={option.value || 'any'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-700">Gender</span>
                    <select
                      className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                      onChange={(event) => handleFilterChange('gender', event.target.value)}
                      value={doctorFilters.gender}
                    >
                      <option value="">Any gender</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-700">Language</span>
                    <select
                      className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                      onChange={(event) => handleFilterChange('language', event.target.value)}
                      value={doctorFilters.language}
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value || 'any'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700">
                  <input
                    checked={doctorFilters.availableToday}
                    className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                    onChange={(event) => handleFilterChange('availableToday', event.target.checked)}
                    type="checkbox"
                  />
                  Available today
                </label>
                <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700">
                  <input
                    checked={doctorFilters.availableThisWeek}
                    className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                    onChange={(event) => handleFilterChange('availableThisWeek', event.target.checked)}
                    type="checkbox"
                  />
                  This week
                </label>
                <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-medical-200 hover:bg-medical-50 hover:text-medical-700">
                  <input
                    checked={doctorFilters.videoAvailable}
                    className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                    onChange={(event) => handleFilterChange('videoAvailable', event.target.checked)}
                    type="checkbox"
                  />
                  Video consultation available
                </label>
                <Button size="sm" type="button" variant="secondary" onClick={() => setShowAdvancedFilters((current) => !current)}>
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {showAdvancedFilters ? 'Hide Filters' : 'More Filters'}
                </Button>
                <Button size="sm" type="submit" disabled={isLoadingDoctors}>
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {isLoadingDoctors ? 'Searching doctors...' : 'Search Doctors'}
                </Button>
                <Button size="sm" type="button" variant="secondary" onClick={handleClearFilters} disabled={isLoadingDoctors}>
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  Clear Filters
                </Button>
              </div>
            </form>
            <div className="mb-5">
              {isLoadingDoctors ? (
                <div className="rounded-lg border border-slate-100 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
                  Searching available doctors...
                </div>
              ) : availableDoctors.length === 0 ? (
                <EmptyState
                  title="No doctors match your search criteria."
                  description="Try a different specialty, availability date, fee range, or qualification."
                  action={(
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button size="sm" type="button" variant="secondary" onClick={handleClearFilters}>
                        Clear Filters
                      </Button>
                      <Button size="sm" type="button" onClick={() => setShowAdvancedFilters(true)}>
                        Adjust Search Criteria
                      </Button>
                    </div>
                  )}
                />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {availableDoctors.map((item) => {
                    const isSelected = String(item.id) === String(selectedDoctor);

                    return (
                      <button
                        className={`rounded-lg border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-medical-200 hover:bg-medical-50/50 hover:shadow-md ${
                          isSelected
                            ? 'border-medical-300 bg-medical-50/80 shadow-sm ring-2 ring-medical-100'
                            : 'border-slate-100 bg-white shadow-sm'
                        }`}
                        key={item.id}
                        onClick={() => setSelectedDoctor(item.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-950">{item.displayName || item.name}</p>
                            {item.qualificationTitle ? (
                              <p className="mt-1 text-xs font-semibold text-slate-500">{item.qualificationTitle}</p>
                            ) : null}
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-medical-50 px-2.5 py-1 text-xs font-bold text-medical-700 ring-1 ring-medical-100">
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              {item.specialty}
                            </span>
                          </div>
                          {item.videoConsultationAvailable ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-50 px-2.5 py-1 text-xs font-bold text-mint-700 ring-1 ring-mint-100">
                              <Video className="h-3.5 w-3.5" aria-hidden="true" />
                              Video consultation
                            </span>
                          ) : null}
                        </div>
                        <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-medical-600" aria-hidden="true" />
                            <span className="font-semibold text-slate-900">{formatDoctorFee(item.consultationFee)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-medical-600" aria-hidden="true" />
                            <span className="truncate">{item.availability}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
                            <span>{Number(item.averageRating || item.rating).toFixed(1)}/5 ({item.reviewCount || 0} reviews)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-medical-600" aria-hidden="true" />
                            <span>{item.yearsOfExperience || 0} years experience</span>
                          </div>
                        </dl>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold text-slate-700">Appointment date</span>
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
                    <h2 className="text-lg font-bold text-slate-950">{doctor.displayName || doctor.name}</h2>
                    <p className="text-sm text-slate-500">{doctor.qualificationTitle ? `${doctor.qualificationTitle} - ${doctor.specialty}` : doctor.specialty}</p>
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
                    <dd className="font-bold text-slate-900">{Number(doctor.averageRating || doctor.rating).toFixed(1)}/5 ({doctor.reviewCount || 0})</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="font-semibold text-slate-600">Completed consultations</dt>
                    <dd className="font-bold text-slate-900">{doctor.patients}</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="font-semibold text-slate-600">Experience</dt>
                    <dd className="font-bold text-slate-900">{doctor.yearsOfExperience || 0} years</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="font-semibold text-slate-600">Next slot</dt>
                    <dd className="font-bold text-slate-900">{doctor.nextAvailableSlot || 'Unavailable'}</dd>
                  </div>
                </dl>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {showIntake ? (
        <Card className="mt-6">
          <CardHeader
            title="Pre-consultation Intake"
            eyebrow={bookedAppointment ? `Appointment #${bookedAppointment.id}` : 'Medical intake'}
          >
            Answer these preliminary questions so the doctor can review your symptoms before the consultation.
          </CardHeader>
          <CardBody>
            {isIntakeSaved ? (
              <div className="rounded-lg border border-mint-100 bg-mint-50/70 p-4">
                <p className="text-sm font-bold text-mint-700">Medical intake saved.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{buildIntakeSummary(intakeAnswers)}</p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-500">
                    Question {intakeStep + 1} of {INTAKE_QUESTIONS.length}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-slate-950">{INTAKE_QUESTIONS[intakeStep].label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{INTAKE_QUESTIONS[intakeStep].prompt}</p>
                </div>
                <div>
                  <textarea
                    className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-medical-500 focus:ring-2 focus:ring-medical-100"
                    onChange={(event) => handleIntakeAnswer(event.target.value)}
                    placeholder="Type your answer"
                    value={intakeAnswers[INTAKE_QUESTIONS[intakeStep].key]}
                  />
                  {intakeError ? <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{intakeError}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {intakeStep > 0 ? (
                      <Button
                        disabled={isSavingIntake}
                        onClick={() => setIntakeStep((currentStep) => currentStep - 1)}
                        type="button"
                        variant="secondary"
                      >
                        Back
                      </Button>
                    ) : null}
                    <Button disabled={isSavingIntake} onClick={handleIntakeNext} type="button">
                      {isSavingIntake
                        ? 'Saving intake...'
                        : intakeStep === INTAKE_QUESTIONS.length - 1
                          ? 'Save Medical Intake'
                          : 'Next question'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
    </DashboardLayout>
  );
}
