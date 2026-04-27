// Minimal Anthropic Messages API client. We don't depend on the SDK to keep
// the install footprint small; the API surface we touch is tiny and stable.

import { logger } from "../logger.js";

export interface AnthropicCallOptions {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface AnthropicResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function callAnthropic(opts: AnthropicCallOptions): Promise<AnthropicResponse> {
  const log = logger().child("anthropic");
  const url = "https://api.anthropic.com/v1/messages";
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };

  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt <= opts.maxRetries) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        // Retry on 429 / 5xx, give up on 4xx.
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`anthropic ${res.status}: ${errText}`);
        }
        throw new TerminalError(`anthropic ${res.status}: ${errText}`);
      }
      const json: any = await res.json();
      const text = (json.content ?? [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
      return {
        text,
        inputTokens: json.usage?.input_tokens,
        outputTokens: json.usage?.output_tokens,
      };
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (err instanceof TerminalError) throw err;
      log.debug(`attempt ${attempt + 1} failed: ${(err as Error)?.message ?? err}`);
      attempt++;
      if (attempt > opts.maxRetries) break;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw lastErr ?? new Error("anthropic call failed");
}

class TerminalError extends Error {}
