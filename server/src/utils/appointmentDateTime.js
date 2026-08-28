import { ApiError } from '../middleware/errors.js';

export const appointmentTimeZone = 'Asia/Ho_Chi_Minh';
const vietnamOffsetMinutes = 7 * 60;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const timePattern = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function assertSupportedTimeZone(timezone) {
  if (timezone !== appointmentTimeZone) {
    throw new ApiError(400, `Unsupported appointment timezone: ${timezone}`);
  }
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

  throw new ApiError(400, 'scheduledDate must use YYYY-MM-DD or dd/MM/yyyy format');
}

function parseTimeParts(value) {
  const rawValue = String(value || '').trim();
  const match = rawValue.match(timePattern);

  if (!match) {
    throw new ApiError(400, 'scheduledTime must use HH:mm format');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    throw new ApiError(400, 'scheduledTime must be a valid time');
  }

  return { hour, minute };
}

function assertValidDate({ year, month, day }) {
  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() !== month - 1
    || value.getUTCDate() !== day
  ) {
    throw new ApiError(400, 'scheduledDate must be a valid calendar date');
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatPartsToLocalIsoDate({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatTimeParts({ hour, minute }) {
  return `${pad(hour)}:${pad(minute)}`;
}

function getPartsFromUtc(utcDateTime, timezone) {
  assertSupportedTimeZone(timezone);
  const value = utcDateTime instanceof Date ? utcDateTime : new Date(utcDateTime);

  if (Number.isNaN(value.getTime())) {
    throw new ApiError(400, 'appointment_datetime must be a valid UTC timestamp');
  }

  const localMilliseconds = value.getTime() + vietnamOffsetMinutes * 60 * 1000;
  const localValue = new Date(localMilliseconds);

  return {
    year: localValue.getUTCFullYear(),
    month: localValue.getUTCMonth() + 1,
    day: localValue.getUTCDate(),
    hour: localValue.getUTCHours(),
    minute: localValue.getUTCMinutes(),
  };
}

export function parseLocalAppointmentDateTime(date, time, timezone = appointmentTimeZone) {
  assertSupportedTimeZone(timezone);
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);
  assertValidDate(dateParts);

  const utcMilliseconds = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
  ) - vietnamOffsetMinutes * 60 * 1000;

  return new Date(utcMilliseconds);
}

export function normalizeLocalAppointmentDateTime(date, time, timezone = appointmentTimeZone) {
  const dateParts = parseDateParts(date);
  const timeParts = parseTimeParts(time);
  assertValidDate(dateParts);
  const utcDate = parseLocalAppointmentDateTime(date, time, timezone);

  return {
    localDate: formatPartsToLocalIsoDate(dateParts),
    localTime: formatTimeParts(timeParts),
    utcDateTime: utcDate.toISOString(),
  };
}

export function convertUtcToDisplayDateTime(utcDateTime, timezone = appointmentTimeZone) {
  const parts = getPartsFromUtc(utcDateTime, timezone);

  return {
    date: `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    localDate: formatPartsToLocalIsoDate(parts),
    localTime: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function addDaysToLocalDate(date, days) {
  const dateParts = parseDateParts(date);
  assertValidDate(dateParts);
  const value = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  value.setUTCDate(value.getUTCDate() + days);

  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function getCurrentLocalDate(timezone = appointmentTimeZone) {
  return convertUtcToDisplayDateTime(new Date(), timezone).localDate;
}
