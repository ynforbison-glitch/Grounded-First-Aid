import { parseJsonFromText } from "./jsonParsing.js";

export class GeminiClient {
  constructor({
    apiKey = process.env.GEMINI_API_KEY || "",
    model = process.env.GEMINI_MODEL || "gemini-3.6-flash",
    enabled = process.env.USE_GEMINI !== "false",
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.enabled = enabled;
    this.fetchImpl = fetchImpl;
  }

  get available() {
    return Boolean(this.enabled && this.apiKey && this.fetchImpl);
  }

  async generateText({
    systemInstruction,
    userText,
    inlineImages = [],
    temperature = 0.1,
    maxOutputTokens = 800,
    responseMimeType
  }) {
    if (!this.available) {
      throw new Error("Gemini is not configured. Set GEMINI_API_KEY or use deterministic fallback.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent`;

    const generationConfig = {
      temperature,
      maxOutputTokens
    };

    if (responseMimeType) {
      generationConfig.responseMimeType = responseMimeType;
    }

    const userParts = [{ text: userText }];
    for (const image of inlineImages) {
      userParts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: image.data
        }
      });
    }

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: userParts
        }
      ],
      generationConfig
    };

    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini request failed with ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    return text;
  }

  async generateJson(options) {
    const text = await this.generateText({
      ...options,
      responseMimeType: "application/json"
    });
    return parseJsonFromText(text);
  }
}
