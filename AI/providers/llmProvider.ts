import axios from 'axios';

export type LlmProvider = 'anthropic' | 'openai' | 'gemini';

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}
interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}
interface GeminiResponse {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
}

export async function callLlm(
  provider: LlmProvider,
  apiKey: string,
  prompt: string,
): Promise<string> {
  switch (provider) {
    case 'anthropic': return callAnthropic(prompt, apiKey);
    case 'openai':    return callOpenAI(prompt, apiKey);
    case 'gemini':    return callGemini(prompt, apiKey);
  }
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const res = await axios.post<AnthropicResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 30_000,
    },
  );
  const block = res.data.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Anthropic returned no text block');
  return block.text;
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await axios.post<OpenAIResponse>(
    'https://api.openai.com/v1/chat/completions',
    {
      model:      'gpt-4o-mini',
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  const text = res.data.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned no content');
  return text;
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await axios.post<GeminiResponse>(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  );
  const text = res.data.candidates[0]?.content?.parts[0]?.text;
  if (!text) throw new Error('Gemini returned no text');
  return text;
}
