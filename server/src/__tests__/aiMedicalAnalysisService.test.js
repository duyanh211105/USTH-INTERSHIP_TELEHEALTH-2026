import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as aiMedicalAnalysisService from '../services/medicalAnalysis/aiMedicalAnalysisService.js';

const {
  AIMedicalAnalysisError,
  analyzeMedicalRecord,
  buildMedicalAnalysisPrompts,
} = aiMedicalAnalysisService;

function getOpenRouterModel(options) {
  return aiMedicalAnalysisService.getOpenRouterModel(options);
}

function validAnalysis(overrides = {}) {
  return {
    summary: 'Synthetic document contains information for clinician review.',
    medical_history: [],
    medications: [],
    allergies: [],
    key_findings: [
      {
        finding: 'Synthetic fever mention',
        source_text: 'Fever for two days',
      },
    ],
    abnormal_values: [],
    red_flags: [],
    possible_conditions: [
      {
        condition: 'Possible viral illness',
        reasoning: 'The document mentions fever and cough, but this is not a diagnosis.',
        source_text: 'Fever and cough',
      },
    ],
    suggested_questions: ['When did the symptom begin?'],
    suggested_follow_up: ['Review the document during consultation.'],
    missing_information: ['No allergy information was included.'],
    ...overrides,
  };
}

function openRouterJsonResponse(value, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: typeof value === 'string' ? value : JSON.stringify(value),
          },
        },
      ],
    }),
  };
}

function createMockOpenRouterFetch(handler) {
  const requests = [];

  return {
    requests,
    fetch: async (url, options = {}) => {
      const body = JSON.parse(options.body);
      const request = {
        url,
        options,
        body,
      };
      requests.push(request);
      return handler(request, requests.length);
    },
  };
}

function providerResponse(status, message = 'provider error') {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}

function networkError(code = 'ECONNRESET') {
  const error = new Error('network failure');
  error.code = code;
  return error;
}

async function assertRejectsWithCode(action, code) {
  await assert.rejects(
    action,
    (error) => error instanceof AIMedicalAnalysisError && error.code === code,
  );
}

const noDelay = async () => {};
const fakeEnv = {
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENROUTER_MODEL: 'stealth/ox-alpha',
};

describe('AI medical analysis service with OpenRouter', () => {
  it('analyzes a normal synthetic medical record through OpenRouter and returns a valid Phase 2A schema object', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));
    const result = await analyzeMedicalRecord('Patient reports fever for two days and cough.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(result.summary, 'Synthetic document contains information for clinician review.');
    assert.equal(result.possible_conditions[0].condition, 'Possible viral illness');
    assert.equal(mock.requests.length, 1);
  });

  it('sends requests to the OpenRouter chat completions endpoint with the configured Ox Alpha model', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await analyzeMedicalRecord('Synthetic note for endpoint verification.', {
      env: { ...fakeEnv, OPENROUTER_MODEL: 'stealth/ox-alpha' },
      fetch: mock.fetch,
      sleep: noDelay,
    });

    const request = mock.requests[0];
    assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.body.model, 'stealth/ox-alpha');
    assert.equal(request.body.response_format.type, 'json_object');
    assert.equal(request.options.headers.Authorization, 'Bearer test-openrouter-key');
  });

  it('uses OPENROUTER_MODEL when configured and defaults to stealth/ox-alpha', () => {
    assert.equal(getOpenRouterModel({ model: 'custom-router-model' }), 'custom-router-model');
    assert.equal(getOpenRouterModel({ env: {} }), 'stealth/ox-alpha');
    assert.equal(getOpenRouterModel({ env: { OPENROUTER_MODEL: 'env-router-model' } }), 'env-router-model');
  });

  it('represents laboratory abnormalities with source text provenance', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis({
      abnormal_values: [
        {
          test: 'Glucose',
          value: '140 mg/dL',
          reference_range: '70-99 mg/dL',
          source_text: 'Glucose 140 mg/dL reference range 70-99 mg/dL',
        },
      ],
    })));

    const result = await analyzeMedicalRecord('Glucose 140 mg/dL reference range 70-99 mg/dL.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(result.abnormal_values[0].test, 'Glucose');
    assert.match(result.abnormal_values[0].source_text, /Glucose 140/);
  });

  it('represents prescription medications when supported by the synthetic document', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis({
      medications: ['Amoxicillin 500mg three times daily'],
      key_findings: [
        {
          finding: 'Prescription medication listed',
          source_text: 'Amoxicillin 500mg three times daily',
        },
      ],
    })));

    const result = await analyzeMedicalRecord('Prescription: Amoxicillin 500mg three times daily.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.deepEqual(result.medications, ['Amoxicillin 500mg three times daily']);
  });

  it('rejects empty or whitespace-only documents before calling OpenRouter', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('   \n\t   ', { env: fakeEnv, fetch: mock.fetch, sleep: noDelay }),
      'EMPTY_DOCUMENT',
    );
    assert.equal(mock.requests.length, 0);
  });

  it('rejects oversized documents before calling OpenRouter', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('A'.repeat(101), {
        env: fakeEnv,
        fetch: mock.fetch,
        maxInputChars: 100,
        sleep: noDelay,
      }),
      'DOCUMENT_TOO_LARGE',
    );
    assert.equal(mock.requests.length, 0);
  });

  it('uses OPENROUTER_MAX_INPUT_CHARS from the environment', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('B'.repeat(51), {
        env: { ...fakeEnv, OPENROUTER_MAX_INPUT_CHARS: '50' },
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'DOCUMENT_TOO_LARGE',
    );
    assert.equal(mock.requests.length, 0);
  });

  it('retries HTTP 429 once and succeeds on the next attempt', async () => {
    const mock = createMockOpenRouterFetch(async (request, attempt) => {
      if (attempt === 1) {
        return providerResponse(429, 'rate limit');
      }
      return openRouterJsonResponse(validAnalysis());
    });

    const result = await analyzeMedicalRecord('Synthetic note with enough text.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(result.summary, validAnalysis().summary);
    assert.equal(mock.requests.length, 2);
  });

  it('retries transient network failures', async () => {
    const mock = createMockOpenRouterFetch(async (request, attempt) => {
      if (attempt === 1) {
        throw networkError('ECONNRESET');
      }
      return openRouterJsonResponse(validAnalysis());
    });

    await analyzeMedicalRecord('Synthetic note with transient network failure.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(mock.requests.length, 2);
  });

  it('retries temporary HTTP 5xx provider failures', async () => {
    const mock = createMockOpenRouterFetch(async (request, attempt) => {
      if (attempt === 1) {
        return providerResponse(503, 'temporary unavailable');
      }
      return openRouterJsonResponse(validAnalysis());
    });

    await analyzeMedicalRecord('Synthetic note with temporary provider failure.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(mock.requests.length, 2);
  });

  it('does not retry HTTP 400 deterministic provider errors', async () => {
    const mock = createMockOpenRouterFetch(async () => providerResponse(400, 'bad request'));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note causing deterministic provider error.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_BAD_REQUEST',
    );
    assert.equal(mock.requests.length, 1);
  });

  it('does not retry HTTP 401 authentication errors', async () => {
    const mock = createMockOpenRouterFetch(async () => providerResponse(401, 'invalid API key'));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with invalid provider credentials.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_AUTH_ERROR',
    );
    assert.equal(mock.requests.length, 1);
  });

  it('does not retry HTTP 403 authorization errors', async () => {
    const mock = createMockOpenRouterFetch(async () => providerResponse(403, 'forbidden'));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with forbidden provider access.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_AUTH_ERROR',
    );
    assert.equal(mock.requests.length, 1);
  });

  it('returns a controlled error after retry exhaustion', async () => {
    const mock = createMockOpenRouterFetch(async () => providerResponse(500, 'provider unavailable'));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note that exhausts retries.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_TEMPORARY_FAILURE',
    );
    assert.equal(mock.requests.length, 3);
  });

  it('masks PII before any content reaches the OpenRouter request', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await analyzeMedicalRecord(`Patient: Nguyen Van A
Phone: 0912345678
Email: test@example.com
Symptoms: fever for two days`, {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    const userMessage = mock.requests[0].body.messages.find((message) => message.role === 'user').content;
    assert.equal(userMessage.includes('Nguyen Van A'), false);
    assert.equal(userMessage.includes('0912345678'), false);
    assert.equal(userMessage.includes('test@example.com'), false);
    assert.match(userMessage, /\[PATIENT_NAME\]/);
    assert.match(userMessage, /\[PHONE\]/);
    assert.match(userMessage, /\[EMAIL\]/);
  });

  it('rejects malformed JSON responses with a controlled provider JSON error', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse('{"summary": "broken"'));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with malformed JSON response.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_INVALID_JSON',
    );
  });

  it('rejects missing schema fields with a controlled schema validation error', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse({
      summary: 'Invalid object is missing required arrays',
    }));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with incomplete model response.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'AI_SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects wrong field types with a controlled schema validation error', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis({
      medications: 'Synthetic medication should be an array',
    })));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with wrong model response type.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'AI_SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects diagnosis misuse and unexpected provider structures', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse({
      ...validAnalysis(),
      diagnosis: 'This must not be accepted as an AI-assisted analysis field',
    }));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with forbidden diagnosis output.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'AI_SCHEMA_VALIDATION_FAILED',
    );
  });

  it('preserves source_text supplied by the provider without fabricating provenance in application code', async () => {
    const analysis = validAnalysis({
      key_findings: [
        {
          finding: 'Document-supported finding',
          source_text: 'Exact synthetic document phrase',
        },
      ],
    });
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(analysis));

    const result = await analyzeMedicalRecord('Exact synthetic document phrase.', {
      env: fakeEnv,
      fetch: mock.fetch,
      sleep: noDelay,
    });

    assert.equal(result.key_findings[0].source_text, 'Exact synthetic document phrase');
  });

  it('keeps backend stable by mapping provider failures to controlled errors', async () => {
    const mock = createMockOpenRouterFetch(async () => {
      throw new Error('unexpected provider failure');
    });

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with provider failure.', {
        env: fakeEnv,
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_PROVIDER_ERROR',
    );
    assert.equal(mock.requests.length, 1);
  });

  it('requires OPENROUTER_API_KEY for live provider configuration', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await assertRejectsWithCode(
      () => analyzeMedicalRecord('Synthetic note with missing provider configuration.', {
        env: {},
        fetch: mock.fetch,
        sleep: noDelay,
      }),
      'OPENROUTER_NOT_CONFIGURED',
    );
    assert.equal(mock.requests.length, 0);
  });

  it('builds safety prompts that prohibit diagnosis and unsupported facts', () => {
    const prompts = buildMedicalAnalysisPrompts('Synthetic de-identified text');

    assert.match(prompts.systemPrompt, /Do NOT provide a definitive diagnosis/i);
    assert.match(prompts.systemPrompt, /Use ONLY information supported/i);
    assert.match(prompts.systemPrompt, /Do NOT invent laboratory values/i);
    assert.match(prompts.systemPrompt, /Do NOT fabricate source_text/i);
    assert.match(prompts.userPrompt, /Synthetic de-identified text/);
  });

  it('allows temperature to be omitted for models that do not support it', async () => {
    const mock = createMockOpenRouterFetch(async () => openRouterJsonResponse(validAnalysis()));

    await analyzeMedicalRecord('Synthetic note for temperature omission.', {
      env: fakeEnv,
      fetch: mock.fetch,
      temperature: null,
      sleep: noDelay,
    });

    assert.equal(Object.hasOwn(mock.requests[0].body, 'temperature'), false);
  });
});
