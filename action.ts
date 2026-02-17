interface ExtensionOptions {
  apikey: string;
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: string;
  maxTokens?: string;
  responseHandling: "append" | "replace" | "copy" | "show";
}

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45000;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

class HttpStatusError extends Error {
  status: number;
  responseBody: unknown;

  constructor(status: number, responseBody: unknown) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

function parseTemperature(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw ?? `${DEFAULT_TEMPERATURE}`);
  if (Number.isNaN(parsed)) {
    return DEFAULT_TEMPERATURE;
  }
  return Math.max(0, Math.min(2, parsed));
}

function parseMaxTokens(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? `${DEFAULT_MAX_TOKENS}`, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_MAX_TOKENS;
  }
  return parsed;
}

function normalizeReplyContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const text = (part as { text?: unknown }).text;
          if (typeof text === "string") {
            return text;
          }
        }
        return "";
      })
      .join("");
    return joined.trim();
  }

  return "";
}

function extractReply(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("API Error: invalid response payload");
  }

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("API Error: no completion choices returned");
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new Error("API Error: invalid completion choice");
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new Error("API Error: invalid completion message");
  }

  const content = (message as { content?: unknown }).content;
  const reply = normalizeReplyContent(content);
  if (!reply) {
    throw new Error("API Error: empty completion message");
  }

  return reply;
}

async function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; data: unknown }> {
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = timeoutMs;
    xhr.responseType = "text";

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.onload = () => {
      const status = xhr.status;
      const responseText = xhr.responseText ?? "";
      let parsed: unknown = responseText;

      if (responseText.trim().length > 0) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = responseText;
        }
      }

      if (status >= 200 && status < 300) {
        resolve({ status, data: parsed });
      } else {
        reject(new HttpStatusError(status, parsed));
      }
    };

    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Request timeout"));
    xhr.send(JSON.stringify(payload));
  });
}

async function run(): Promise<void> {
  const input = popclip.input;
  const options = popclip.options as unknown as ExtensionOptions;
  const apikey = (options.apikey ?? "").trim();
  if (!apikey) {
    throw new Error("Settings error: API Key is required");
  }

  const model = (options.model ?? DEFAULT_MODEL).trim();
  const temperature = parseTemperature(options.temperature);
  const maxTokens = parseMaxTokens(options.maxTokens);

  const inputText = input.text.trim();

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (options.systemPrompt?.trim()) {
    messages.push({ role: "system", content: options.systemPrompt.trim() });
  }

  let userContent = inputText;
  if (options.userPrompt?.trim()) {
    const prompt = options.userPrompt.trim();
    if (prompt.includes("{{text}}")) {
      userContent = prompt.replace(/{{text}}/g, inputText);
    } else {
      userContent = `${prompt}\n\n${inputText}`;
    }
  }
  messages.push({ role: "user", content: userContent });

  try {
    const response = await postJson(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
      },
      {
        Authorization: `Bearer ${apikey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://popclip.app/",
        "X-Title": "PopClip Extension",
      },
      REQUEST_TIMEOUT_MS
    );

    const reply = extractReply(response.data);

    if (options.responseHandling === "copy") {
      popclip.copyText(reply);
    } else if (options.responseHandling === "show") {
      popclip.showText(reply, { preview: true });
    } else if (options.responseHandling === "replace") {
      popclip.pasteText(reply);
    } else {
      popclip.pasteText(`${input.text}\n\n${reply}`);
    }
  } catch (error: unknown) {
    let errorMsg = "Unknown Error";
    if (error instanceof HttpStatusError) {
      const status = error.status;
      const data = error.responseBody;

      let apiMessage: string | undefined;
      if (data && typeof data === "object") {
        const apiError = (data as { error?: unknown }).error;
        if (apiError && typeof apiError === "object") {
          const message = (apiError as { message?: unknown }).message;
          if (typeof message === "string") {
            apiMessage = message;
          }
        }
      } else if (typeof data === "string") {
        apiMessage = data;
      }

      errorMsg = `API Error ${status}: ${apiMessage ?? "Request failed"}`;
    } else if (error instanceof Error) {
      errorMsg = `Network/Error: ${error.message}`;
    }

    print(errorMsg);
    throw new Error(errorMsg);
  }
}

(async () => {
  return await run();
})();
