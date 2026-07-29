const MIN_MODEL_CONFIDENCE = 0.6;

const keywordRules = [
  {
    scenario_id: "severe_bleeding",
    weight: 4,
    patterns: [
      /\bblood (is )?everywhere\b/i,
      /\bbleeding (badly|a lot|heavily|severely)\b/i,
      /\bcut\b.*\bblood\b/i,
      /\bcut\b.*\bbadly\b/i,
      /\bsevere bleeding\b/i,
      /\bspurting blood\b/i,
      /\bdeep cut\b/i,
      /\bbad cut\b/i,
      /\btourniquet\b/i,
      /\bwound\b.*\bbleed/i
    ]
  },
  {
    scenario_id: "choking_adult",
    weight: 4,
    patterns: [
      /\bchok(?:e|ing|ed)\b/i,
      /\bcan't breathe\b/i,
      /\bcannot breathe\b/i,
      /\bfood stuck\b/i,
      /\bstuck in (their |his |her |my )?throat\b/i,
      /\bcan't (talk|speak|cough)\b/i,
      /\bcannot (talk|speak|cough)\b/i,
      /\bheimlich\b/i
    ]
  },
  {
    scenario_id: "unresponsive_breathing",
    weight: 3,
    patterns: [
      /\bunresponsive\b.*\bbreath/i,
      /\bunconscious\b.*\bbreath/i,
      /\bpassed out\b/i,
      /\bfainted\b/i,
      /\bcollapsed\b/i,
      /\bnot responding\b/i,
      /\bwon't wake\b/i
    ]
  }
];

export async function classifyScenario({ message, protocolLibrary, geminiClient, image = null }) {
  const modelResult = await classifyWithGemini({ message, protocolLibrary, geminiClient, image });
  if (modelResult && modelResult.confidence >= MIN_MODEL_CONFIDENCE) {
    return modelResult;
  }

  const keywordResult = classifyWithKeywords({ message, protocolLibrary });
  if (keywordResult.scenario_id !== "unknown") {
    return keywordResult;
  }

  return (
    modelResult || {
      scenario_id: "unknown",
      confidence: 0,
      source: "none",
      rationale: "No protocol matched the request."
    }
  );
}

export function classifyWithKeywords({ message, protocolLibrary }) {
  const scores = new Map();

  for (const rule of keywordRules) {
    if (!protocolLibrary.has(rule.scenario_id)) {
      continue;
    }

    const hits = rule.patterns.filter((pattern) => pattern.test(message)).length;
    if (hits > 0) {
      scores.set(rule.scenario_id, hits * rule.weight);
    }
  }

  for (const protocol of protocolLibrary.protocols.values()) {
    const hintHits = protocol.classification_hints.filter((hint) =>
      message.toLowerCase().includes(hint.toLowerCase())
    ).length;

    if (hintHits > 0) {
      scores.set(protocol.scenario_id, (scores.get(protocol.scenario_id) || 0) + hintHits * 2);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return {
      scenario_id: "unknown",
      confidence: 0,
      source: "keyword",
      rationale: "No keyword or protocol hint matched."
    };
  }

  const [scenarioId, score] = ranked[0];
  const confidence = Math.min(0.95, 0.45 + score / 20);

  return {
    scenario_id: scenarioId,
    confidence,
    source: "keyword",
    rationale: `Matched local protocol keywords for ${scenarioId}.`
  };
}

async function classifyWithGemini({ message, protocolLibrary, geminiClient, image }) {
  if (!geminiClient?.available) {
    return null;
  }

  const protocols = protocolLibrary.list().map((protocol) => ({
    scenario_id: protocol.scenario_id,
    title: protocol.title,
    hints: protocol.classification_hints
  }));

  const systemInstruction = [
    "You classify first-aid user messages to one known scenario_id.",
    "Return only valid JSON.",
    "Do not provide first-aid instructions.",
    "If an image is provided, use it only to classify the situation to the closest supplied protocol.",
    "If no scenario matches, use scenario_id unknown.",
    "Allowed scenario_ids are the protocol ids supplied by the application."
  ].join("\n");

  const userText = JSON.stringify(
    {
      message: message || "(No written message. User uploaded an image.)",
      image: image
        ? {
            present: true,
            mime_type: image.mimeType,
            name: image.name || "uploaded image"
          }
        : { present: false },
      protocols,
      response_shape: {
        scenario_id: "one protocol scenario_id or unknown",
        confidence: "number from 0 to 1",
        rationale: "short reason, no medical instructions"
      }
    },
    null,
    2
  );

  try {
    const result = await geminiClient.generateJson({
      systemInstruction,
      userText,
      inlineImages: image ? [image] : [],
      temperature: 0,
      maxOutputTokens: 300
    });

    if (
      typeof result?.scenario_id !== "string" ||
      (result.scenario_id !== "unknown" && !protocolLibrary.has(result.scenario_id))
    ) {
      return null;
    }

    return {
      scenario_id: result.scenario_id,
      confidence: clampConfidence(result.confidence),
      source: "gemini",
      rationale: typeof result.rationale === "string" ? result.rationale : "Gemini classification."
    };
  } catch (error) {
    return {
      scenario_id: "unknown",
      confidence: 0,
      source: "gemini_error",
      rationale: error.message
    };
  }
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(1, number));
}
