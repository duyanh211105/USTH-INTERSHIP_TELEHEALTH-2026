export const doctorQualifications = [
  { value: 'PROFESSOR', label: 'Professor', displayPrefix: 'Professor' },
  { value: 'ASSOCIATE_PROFESSOR', label: 'Associate Professor', displayPrefix: 'Associate Professor' },
  { value: 'SPECIALIST_LEVEL_I', label: 'Specialist Level I', displaySuffix: 'BS CKI' },
  { value: 'SPECIALIST_LEVEL_II', label: 'Specialist Level II', displaySuffix: 'BS CKII' },
  { value: 'MASTER_OF_MEDICINE', label: 'Master of Medicine', displaySuffix: 'Master of Medicine' },
  { value: 'DOCTOR_OF_PHILOSOPHY', label: 'Doctor of Philosophy', displaySuffix: 'PhD' },
  { value: 'GENERAL_PRACTITIONER', label: 'General Practitioner', displaySuffix: 'General Practitioner' },
  { value: 'RESIDENT_DOCTOR', label: 'Resident Doctor', displaySuffix: 'Resident Doctor' },
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeQualificationCode(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return '';
  }

  const option = doctorQualifications.find((qualification) => (
    normalizeText(qualification.value) === normalized
    || normalizeText(qualification.label) === normalized
    || normalizeText(qualification.displaySuffix) === normalized
    || normalizeText(qualification.displayPrefix) === normalized
  ));

  return option?.value || '';
}

export function getQualificationLabel(value) {
  const code = normalizeQualificationCode(value) || String(value || '').trim();
  return doctorQualifications.find((qualification) => qualification.value === code)?.label || String(value || '').trim();
}

export function formatDoctorNameWithQualification(name, qualification) {
  const code = normalizeQualificationCode(qualification);
  const option = doctorQualifications.find((item) => item.value === code);

  if (!option) {
    return name;
  }

  if (option.displayPrefix) {
    return `${option.displayPrefix} ${name}`;
  }

  return `${name}, ${option.displaySuffix || option.label}`;
}
