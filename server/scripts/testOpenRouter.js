import 'dotenv/config';
import { analyzeMedicalRecord } from '../src/services/medicalAnalysis/aiMedicalAnalysisService.js';

const syntheticMedicalText = [
  '45-year-old male.',
  'Reports increased thirst and frequent urination.',
  'Glucose 8.7 mmol/L.',
  'HbA1c 7.2%.',
  'No medication information available.',
].join(' ');

function collectSourceTexts(analysis) {
  return [
    ...(analysis.key_findings || []).map((item) => item.source_text),
    ...(analysis.abnormal_values || []).map((item) => item.source_text),
    ...(analysis.red_flags || []).map((item) => item.source_text),
    ...(analysis.possible_conditions || []).map((item) => item.source_text).filter(Boolean),
  ].filter(Boolean);
}

function findUnsupportedSourceTexts(analysis, documentText) {
  const haystack = String(documentText || '').toLowerCase();
  return collectSourceTexts(analysis).filter((sourceText) => (
    !haystack.includes(String(sourceText).toLowerCase())
  ));
}

if (!process.env.OPENROUTER_API_KEY) {
  console.log('OpenRouter live test skipped: OPENROUTER_API_KEY is not configured.');
  process.exit(0);
}

try {
  const startedAt = Date.now();
  const analysis = await analyzeMedicalRecord(syntheticMedicalText);
  const durationMs = Date.now() - startedAt;
  const unsupportedSourceTexts = findUnsupportedSourceTexts(analysis, syntheticMedicalText);

  if (unsupportedSourceTexts.length > 0) {
    throw new Error('OpenRouter response contained unsupported source_text values.');
  }

  console.log(JSON.stringify({
    provider: 'openrouter',
    model: process.env.OPENROUTER_MODEL || 'stealth/ox-alpha',
    durationMs,
    summaryLength: analysis.summary.length,
    keyFindingCount: analysis.key_findings.length,
    abnormalValueCount: analysis.abnormal_values.length,
    possibleConditionCount: analysis.possible_conditions.length,
    diagnosisFieldPresent: Object.hasOwn(analysis, 'diagnosis'),
    schemaValidated: true,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    provider: 'openrouter',
    model: process.env.OPENROUTER_MODEL || 'stealth/ox-alpha',
    errorCode: error?.code || 'OPENROUTER_LIVE_TEST_FAILED',
    message: 'OpenRouter live synthetic analysis test failed.',
  }, null, 2));
  process.exit(1);
}
