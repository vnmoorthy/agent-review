// OpenAI-compatible chat-completions client. Covers OpenAI, Groq, Together,
// Fireworks, vLLM, and any other endpoint that mimics the /v1/chat/completions
// shape. Authenticates via a single bearer token; the caller decides which
// service it points at by setting baseUrl.

import { logger } from "../logger.js";

export interface OpenAICallOptions {
  apiKey: string;
  baseUrl: string; // e.g. https://api.openai.com or https://api.groq.com/openai
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface OpenAIResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function callOpenAI(opts: OpenAICallOptions): Promise<OpenAIResponse> {
  const log = logger().child("openai");
  const url = `${opts.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= opts.maxRetries) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          messages,
          temperature: opts.temperature ?? 0,
          max_tokens: opts.maxTokens ?? 2048,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`openai-compat ${res.status}: ${errText}`);
        }
        // 4xx (except 429) is permanent.
        const e = new Error(`openai-compat ${res.status}: ${errText}`);
        (e as any).terminal = true;
        throw e;
      }
      const json: any = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      return {
        text,
        inputTokens: json?.usage?.prompt_tokens,
        outputTokens: json?.usage?.completion_tokens,
      };
    } catch (err: any) {
      clearTimeout(t);
      lastErr = err;
      if (err?.terminal) throw err;
      log.debug(`attempt ${attempt + 1} failed: ${err?.message ?? err}`);
      attempt++;
      if (attempt > opts.maxRetries) break;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr ?? new Error("openai-compat call failed");
}
