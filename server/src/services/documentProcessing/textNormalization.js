export const MIN_MEANINGFUL_TEXT_LENGTH = 50;

const controlCharactersPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const whitespacePattern = /\s+/g;
const meaningfulCharactersPattern = /[\p{L}\p{N}]/gu;

export function normalizeExtractedText(value = '') {
  return String(value || '')
    .replace(controlCharactersPattern, ' ')
    .replace(whitespacePattern, ' ')
    .trim();
}

export function countMeaningfulCharacters(value = '') {
  const normalized = normalizeExtractedText(value);
  return (normalized.match(meaningfulCharactersPattern) || []).length;
}

export function hasMeaningfulText(value = '', threshold = MIN_MEANINGFUL_TEXT_LENGTH) {
  return countMeaningfulCharacters(value) >= threshold;
}
