// Local Ollama client. Useful for users who don't want to ship code to a
// hosted model. We require the Ollama server to be running locally and the
// `OLLAMA_BASE_URL` environment variable (or `--ollama-url` flag) to be set.

import { logger } from "../logger.js";

export interface OllamaCallOptions {
  baseUrl: string;
  model: string;
  system?: string;
  user: string;
  timeoutMs: number;
  maxRetries: number;
  temperature?: number;
}

export interface OllamaResponse {
  text: string;
}

export async function callOllama(opts: OllamaCallOptions): Promise<OllamaResponse> {
  const log = logger().child("ollama");
  const url = `${opts.baseUrl.replace(/\/$/, "")}/api/chat`;
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  let attempt = 0;
  while (attempt <= opts.maxRetries) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: false,
          options: { temperature: opts.temperature ?? 0 },
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`ollama ${res.status}: ${errText}`);
      }
      const json: any = await res.json();
      const text = json?.message?.content ?? "";
      return { text };
    } catch (err) {
      clearTimeout(t);
      log.debug(`attempt ${attempt + 1} failed: ${(err as Error)?.message ?? err}`);
      attempt++;
      if (attempt > opts.maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw new Error("ollama call failed");
}
