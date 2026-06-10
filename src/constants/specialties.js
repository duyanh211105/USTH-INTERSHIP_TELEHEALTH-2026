export const SPECIALTIES = [
  { value: 'CARDIOLOGY', label: 'Cardiology', aliases: ['heart', 'heart doctor', 'tim'] },
  { value: 'DERMATOLOGY', label: 'Dermatology', aliases: ['skin', 'da lieu'] },
  { value: 'NEUROLOGY', label: 'Neurology', aliases: ['brain', 'nerve', 'than kinh'] },
  { value: 'PEDIATRICS', label: 'Pediatrics', aliases: ['pediatric', 'children', 'nhi khoa'] },
  { value: 'ORTHOPEDICS', label: 'Orthopedics', aliases: ['orthopedic', 'bone', 'co xuong khop'] },
  { value: 'ENT', label: 'ENT', aliases: ['ear nose throat', 'tai mui hong'] },
  { value: 'PSYCHIATRY', label: 'Psychiatry', aliases: ['mental health', 'tam than'] },
  { value: 'GENERAL_MEDICINE', label: 'General Medicine', aliases: ['family medicine', 'internal medicine', 'general'] },
  { value: 'RADIOLOGY', label: 'Radiology', aliases: ['xray', 'x-ray', 'imaging'] },
  { value: 'LABORATORY', label: 'Laboratory', aliases: ['lab', 'testing', 'diagnostics'] },
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeSpecialtyCode(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return '';
  }

  const option = SPECIALTIES.find((specialty) => (
    normalizeText(specialty.value) === normalized
    || normalizeText(specialty.label) === normalized
    || specialty.aliases.some((alias) => normalizeText(alias) === normalized)
  ));

  return option?.value || '';
}

export function getSpecialtyLabel(value) {
  const code = normalizeSpecialtyCode(value) || String(value || '').trim();
  return SPECIALTIES.find((specialty) => specialty.value === code)?.label || String(value || '').trim();
}
