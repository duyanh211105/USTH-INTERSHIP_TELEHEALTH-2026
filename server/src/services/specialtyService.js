export const specialtyOptions = [
  {
    code: 'CARDIOLOGY',
    label: 'Cardiology',
    aliases: ['cardiology', 'cardio', 'heart', 'heart doctor', 'tim'],
  },
  {
    code: 'DERMATOLOGY',
    label: 'Dermatology',
    aliases: ['dermatology', 'skin', 'skin doctor', 'da lieu'],
  },
  {
    code: 'NEUROLOGY',
    label: 'Neurology',
    aliases: ['neurology', 'neuro', 'brain', 'nerve', 'than kinh'],
  },
  {
    code: 'PEDIATRICS',
    label: 'Pediatrics',
    aliases: ['pediatrics', 'pediatric', 'children', 'child doctor', 'nhi khoa'],
  },
  {
    code: 'ORTHOPEDICS',
    label: 'Orthopedics',
    aliases: ['orthopedics', 'orthopedic', 'bone', 'bones', 'joint', 'co xuong khop'],
  },
  {
    code: 'ENT',
    label: 'ENT',
    aliases: ['ent', 'ear nose throat', 'ear', 'nose', 'throat', 'tai mui hong'],
  },
  {
    code: 'PSYCHIATRY',
    label: 'Psychiatry',
    aliases: ['psychiatry', 'psychiatric', 'mental health', 'tam than'],
  },
  {
    code: 'GENERAL_MEDICINE',
    label: 'General Medicine',
    aliases: ['general medicine', 'general', 'family medicine', 'internal medicine', 'gp', 'noi tong quat'],
  },
  {
    code: 'RADIOLOGY',
    label: 'Radiology',
    aliases: ['radiology', 'xray', 'x-ray', 'imaging', 'chan doan hinh anh'],
  },
  {
    code: 'LABORATORY',
    label: 'Laboratory',
    aliases: ['laboratory', 'lab', 'testing', 'diagnostics', 'xet nghiem'],
  },
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
    return null;
  }

  const directCode = specialtyOptions.find((option) => normalizeText(option.code) === normalized);
  if (directCode) {
    return directCode.code;
  }

  const directLabel = specialtyOptions.find((option) => normalizeText(option.label) === normalized);
  if (directLabel) {
    return directLabel.code;
  }

  const aliasMatch = specialtyOptions.find((option) => (
    option.aliases.some((alias) => normalizeText(alias) === normalized)
  ));

  return aliasMatch?.code || null;
}

export function getSpecialtyLabel(value) {
  const code = normalizeSpecialtyCode(value);
  const option = specialtyOptions.find((item) => item.code === code);
  return option?.label || String(value || '').trim();
}

export function normalizeSpecialtyForStorage(value) {
  const code = normalizeSpecialtyCode(value);
  return code ? getSpecialtyLabel(code) : String(value || '').trim();
}

export function getSpecialtySearchTerms(value) {
  const code = normalizeSpecialtyCode(value);
  const option = specialtyOptions.find((item) => item.code === code);

  if (!option) {
    return [];
  }

  return Array.from(new Set([
    normalizeText(option.code),
    normalizeText(option.label),
    ...option.aliases.map(normalizeText),
  ].filter(Boolean)));
}
