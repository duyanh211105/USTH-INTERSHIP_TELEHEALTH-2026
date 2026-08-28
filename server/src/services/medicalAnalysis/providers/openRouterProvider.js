export const openRouterChatCompletionsEndpoint = 'https://openrouter.ai/api/v1/chat/completions';

export async function createOpenRouterChatCompletion(payload, {
  apiKey,
  fetchImpl = globalThis.fetch,
  endpoint = openRouterChatCompletionsEndpoint,
  referer,
  title,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    const error = new Error('Fetch API is not available for OpenRouter requests');
    error.code = 'FETCH_NOT_AVAILABLE';
    throw error;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (referer) {
    headers['HTTP-Referer'] = referer;
  }

  if (title) {
    headers['X-Title'] = title;
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response?.ok) {
    const error = new Error('OpenRouter request failed');
    error.status = Number(response?.status || 0);

    try {
      const body = await response?.json?.();
      error.providerCode = body?.error?.code || body?.code;
    } catch {
      // Provider error bodies are intentionally not surfaced to callers.
    }

    throw error;
  }

  return response.json();
}
