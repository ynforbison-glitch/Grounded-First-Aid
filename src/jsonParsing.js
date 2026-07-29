export function parseJsonFromText(text) {
  if (typeof text !== "string") {
    throw new Error("Expected text from model");
  }

  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue and try to recover JSON from a fenced or mixed response.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Model response did not contain valid JSON");
}

export function stableJson(value) {
  return JSON.stringify(value, null, 2);
}
