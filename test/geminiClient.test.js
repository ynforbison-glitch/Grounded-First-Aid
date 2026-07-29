import test from "node:test";
import assert from "node:assert/strict";
import { GeminiClient } from "../src/geminiClient.js";

test("sends inline images to Gemini", async () => {
  let payload;
  const client = new GeminiClient({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }]
        })
      };
    }
  });

  const result = await client.generateJson({
    systemInstruction: "Return JSON.",
    userText: "Look at this image.",
    inlineImages: [{ mimeType: "image/png", data: "aGVsbG8=" }]
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(payload.contents[0].parts, [
    { text: "Look at this image." },
    {
      inline_data: {
        mime_type: "image/png",
        data: "aGVsbG8="
      }
    }
  ]);
});
