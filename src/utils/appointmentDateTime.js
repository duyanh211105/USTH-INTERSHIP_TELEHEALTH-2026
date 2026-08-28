export const APPOINTMENT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const vietnamOffsetMinutes = 7 * 60;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const timePattern = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDateParts(value) {
  const rawValue = String(value || '').trim();
  const isoMatch = rawValue.match(isoDatePattern);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const displayMatch = rawValue.match(displayDatePattern);
  if (displayMatch) {
    return {
      year: Number(displayMatch[3]),
      month: Number(displayMatch[2]),
      day: Number(displayMatch[1]),
    };
  }

  return null;
}

function parseTimeParts(value) {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(timePattern);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function isValidDate({ year, month, day }) {
  const value = new Date(Date.UTC(year, month - 1, day));

  return (
    value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day
  );
}

function getPartsFromUtc(utcDateTime) {
  const value = utcDateTime instanceof Date ? utcDateTime : new Date(utcDateTime);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const localValue = new Date(value.getTime() + vietnamOffsetMinutes * 60 * 1000);

  return {
    year: localValue.getUTCFullYear(),
    month: localValue.getUTCMonth() + 1,
    day: localValue.getUTCDate(),
    hour: localValue.getUTCHours(),
    minute: localValue.getUTCMinutes(),
  };
}

export function parseLocalAppointmentDateTime(date, time) {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);

  if (!dateParts || !timeParts || !isValidDate(dateParts)) {
    return null;
  }

  return new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute)
      - vietnamOffsetMinutes * 60 * 1000,
  );
}

export function convertUtcToDisplayDateTime(utcDateTime) {
  const parts = getPartsFromUtc(utcDateTime);

  if (!parts) {
    return null;
  }

  return {
    date: `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    localDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    localTime: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function getCurrentLocalDate() {
  return convertUtcToDisplayDateTime(new Date())?.localDate || new Date().toISOString().slice(0, 10);
}

export function addDaysToLocalDate(date, days) {
  const dateParts = parseDateParts(date);

  if (!dateParts || !isValidDate(dateParts)) {
    return date;
  }

  const value = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  value.setUTCDate(value.getUTCDate() + days);

  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}
