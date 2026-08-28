import { normalizeExtractedText } from '../documentProcessing/textNormalization.js';
import { deidentifyMedicalText } from './deidentifyMedicalText.js';
import {
  MedicalRecordAnalysisValidationError,
  validateMedicalRecordAnalysis,
} from './medicalRecordAnalysisSchema.js';
import { createOpenRouterChatCompletion } from './providers/openRouterProvider.js';

const defaultModel = 'stealth/ox-alpha';
const defaultMaxInputChars = 20000;
const defaultMaxRetries = 2;
const defaultBaseDelayMs = 250;

export class AIMedicalAnalysisError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AIMedicalAnalysisError';
    this.code = code;
    this.details = details;
  }
}

export function getOpenRouterModel({ model, env = process.env } = {}) {
  return model || env.OPENROUTER_MODEL || defaultModel;
}

function getMaxInputChars({ maxInputChars, env = process.env } = {}) {
  const configured = maxInputChars ?? env.OPENROUTER_MAX_INPUT_CHARS;
  const parsed = Number(configured);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxInputChars;
}

function getOpenRouterApiKey({ apiKey, env = process.env } = {}) {
  const configuredApiKey = apiKey ?? env.OPENROUTER_API_KEY;

  if (!configuredApiKey) {
    throw new AIMedicalAnalysisError(
      'OPENROUTER_NOT_CONFIGURED',
      'OpenRouter API key is not configured',
    );
  }

  return configuredApiKey;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function statusFromProviderError(error) {
  return Number(error?.status || error?.response?.status || error?.cause?.status || 0);
}

function codeFromProviderError(error) {
  return String(error?.code || error?.cause?.code || '').toUpperCase();
}

function isNetworkRetryable(error) {
  const code = codeFromProviderError(error);
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT'].includes(code);
}

function isRetryableProviderError(error) {
  const status = statusFromProviderError(error);

  if (status === 429) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  return isNetworkRetryable(error);
}

function mapProviderError(error, retriesExhausted = false) {
  if (error instanceof AIMedicalAnalysisError) {
    return error;
  }

  const status = statusFromProviderError(error);

  if (status === 400) {
    return new AIMedicalAnalysisError('OPENROUTER_BAD_REQUEST', 'OpenRouter rejected the analysis request');
  }

  if (status === 401 || status === 403) {
    return new AIMedicalAnalysisError('OPENROUTER_AUTH_ERROR', 'OpenRouter authentication or authorization failed');
  }

  if (status === 429 && retriesExhausted) {
    return new AIMedicalAnalysisError('OPENROUTER_RATE_LIMIT_EXHAUSTED', 'OpenRouter rate limit persisted after retries');
  }

  if ((status >= 500 && status <= 599) || isNetworkRetryable(error)) {
    return new AIMedicalAnalysisError('OPENROUTER_TEMPORARY_FAILURE', 'OpenRouter temporary failure persisted after retries');
  }

  return new AIMedicalAnalysisError('OPENROUTER_PROVIDER_ERROR', 'OpenRouter provider request failed');
}

function getMessageContent(completion) {
  const content = completion?.choices?.[0]?.message?.content;

  if (content !== undefined && content !== null) {
    return content;
  }

  return completion?.output_text ?? null;
}

function parseOpenRouterJsonContent(content) {
  if (content && typeof content === 'object') {
    return content;
  }

  if (typeof content !== 'string') {
    throw new AIMedicalAnalysisError(
      'OPENROUTER_INVALID_JSON',
      'OpenRouter returned a response without JSON content',
    );
  }

  try {
    return JSON.parse(content.trim());
  } catch {
    throw new AIMedicalAnalysisError(
      'OPENROUTER_INVALID_JSON',
      'OpenRouter returned malformed JSON content',
    );
  }
}

function buildJsonOutputInstructions() {
  return [
    'Return exactly one valid JSON object and no markdown.',
    'The JSON object must contain these top-level fields:',
    'summary: string;',
    'medical_history: string[];',
    'medications: string[];',
    'allergies: string[];',
    'key_findings: { finding: string, source_text: string }[];',
    'abnormal_values: { test: string, value: string, reference_range: string | null, source_text: string }[];',
    'red_flags: { finding: string, source_text: string }[];',
    'possible_conditions: { condition: string, reasoning: string, source_text: string | null }[];',
    'suggested_questions: string[];',
    'suggested_follow_up: string[];',
    'missing_information: string[].',
    'Do not include a diagnosis field or any fields outside this structure.',
  ].join(' ');
}

export function buildMedicalAnalysisPrompts(deidentifiedText) {
  const systemPrompt = [
    'You are a clinical decision-support assistant for reviewing extracted medical document text.',
    'Use ONLY information supported by the provided document.',
    'Do NOT invent medical facts.',
    'Do NOT invent symptoms.',
    'Do NOT invent laboratory values.',
    'Do NOT invent medications.',
    'Do NOT invent allergies.',
    'Do NOT invent patient information.',
    'Do NOT provide a definitive diagnosis.',
    'Do NOT convert possible conditions into confirmed diagnoses.',
    'Possible conditions must remain suggestions requiring professional review.',
    'Do NOT fabricate source_text.',
    'For key_findings, abnormal_values, red_flags, and possible_conditions, source_text must match text actually present in the supplied document or be null only where the schema allows null.',
    'Populate missing or unsupported fields with empty arrays where appropriate.',
    'Do NOT invent placeholder values merely to satisfy required fields.',
    'Distinguish document-supported facts from clinical suggestions.',
    buildJsonOutputInstructions(),
  ].join(' ');

  const userPrompt = [
    'Analyze the following de-identified extracted medical document text.',
    'The output is not a diagnosis and must not modify the official clinical record.',
    '',
    'DOCUMENT_TEXT:',
    deidentifiedText,
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function buildRequestPayload({ model, deidentifiedText, temperature = 0 }) {
  const { systemPrompt, userPrompt } = buildMedicalAnalysisPrompts(deidentifiedText);
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_object',
    },
  };

  if (temperature !== null && temperature !== undefined) {
    payload.temperature = temperature;
  }

  return payload;
}

async function callOpenRouterWithRetry(payload, {
  apiKey,
  fetchImpl,
  maxRetries = defaultMaxRetries,
  baseDelayMs = defaultBaseDelayMs,
  sleepFn = sleep,
  endpoint,
  referer,
  title,
} = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await createOpenRouterChatCompletion(payload, {
        apiKey,
        fetchImpl,
        endpoint,
        referer,
        title,
      });
    } catch (error) {
      lastError = error;

      if (!isRetryableProviderError(error)) {
        throw mapProviderError(error);
      }

      if (attempt >= maxRetries) {
        throw mapProviderError(error, true);
      }

      await sleepFn(baseDelayMs * (2 ** attempt));
    }
  }

  throw mapProviderError(lastError, true);
}

export async function analyzeMedicalRecord(extractedText, options = {}) {
  const normalizedText = normalizeExtractedText(extractedText);

  if (!normalizedText) {
    throw new AIMedicalAnalysisError(
      'EMPTY_DOCUMENT',
      'Extracted medical document text is empty',
    );
  }

  const deidentified = deidentifyMedicalText(normalizedText);
  const maxInputChars = getMaxInputChars(options);

  if (deidentified.text.length > maxInputChars) {
    throw new AIMedicalAnalysisError(
      'DOCUMENT_TOO_LARGE',
      'De-identified medical document text exceeds configured analysis limit',
      { maxInputChars },
    );
  }

  const apiKey = getOpenRouterApiKey(options);
  const temperature = Object.hasOwn(options, 'temperature') ? options.temperature : 0;
  const payload = buildRequestPayload({
    model: getOpenRouterModel(options),
    deidentifiedText: deidentified.text,
    temperature,
  });

  const completion = await callOpenRouterWithRetry(payload, {
    apiKey,
    fetchImpl: options.fetch || options.fetchImpl,
    maxRetries: options.maxRetries ?? defaultMaxRetries,
    baseDelayMs: options.baseDelayMs ?? defaultBaseDelayMs,
    sleepFn: options.sleep,
    endpoint: options.endpoint,
    referer: options.referer,
    title: options.title,
  });
  const parsed = parseOpenRouterJsonContent(getMessageContent(completion));

  try {
    return validateMedicalRecordAnalysis(parsed);
  } catch (error) {
    if (error instanceof MedicalRecordAnalysisValidationError) {
      throw new AIMedicalAnalysisError(
        'AI_SCHEMA_VALIDATION_FAILED',
        'OpenRouter returned an invalid medical analysis structure',
        { issues: error.issues },
      );
    }

    throw error;
  }
}
