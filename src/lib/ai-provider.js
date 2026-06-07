const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function requestMarkdownWithProvider({
  provider,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  fetchImpl = fetch,
}) {
  if (provider === 'codex') {
    return requestCodexMarkdown({
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      fetchImpl,
    });
  }

  if (provider === 'openrouter') {
    return requestOpenRouterMarkdown({
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      fetchImpl,
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function requestCodexMarkdown({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  fetchImpl,
}) {
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input: userPrompt,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Codex request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload.output_text || extractOutputText(payload);

  if (!outputText?.trim()) {
    throw new Error('Codex response did not contain markdown output.');
  }

  return outputText.trim();
}

async function requestOpenRouterMarkdown({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  fetchImpl,
}) {
  const response = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload?.choices?.[0]?.message?.content;

  if (typeof outputText !== 'string' || !outputText.trim()) {
    throw new Error('OpenRouter response did not contain markdown output.');
  }

  return outputText.trim();
}

function extractOutputText(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const textParts = [];

  for (const item of output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem?.type === 'output_text' && typeof contentItem.text === 'string') {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join('\n').trim();
}
