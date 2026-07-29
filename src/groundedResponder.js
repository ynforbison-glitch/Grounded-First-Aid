import { stableJson } from "./jsonParsing.js";
import { imagePromptSummary } from "./uploadedImage.js";

const MAX_GUIDANCE_LENGTH = 2000;

export async function generateGroundedGuidance({ message, protocol, geminiClient, image = null }) {
  if (geminiClient?.available) {
    const modelGuidance = await generateWithGemini({ message, protocol, geminiClient, image });
    if (modelGuidance.valid) {
      return modelGuidance.answer;
    }
  }

  return renderProtocolGuidance({
    message,
    protocol,
    generatedBy: "protocol_renderer",
    validation: {
      passed: true,
      warnings: [
        image
          ? "Gemini unavailable or invalid; image was not interpreted and guidance was rendered directly from protocol."
          : "Gemini unavailable or invalid; rendered directly from protocol."
      ]
    }
  });
}

export function renderProtocolGuidance({
  message,
  protocol,
  generatedBy = "protocol_renderer",
  validation = { passed: true, warnings: [] }
}) {
  const selectedSteps = protocol.steps
    .filter((step) => step.default_included)
    .sort((a, b) => a.priority - b.priority);

  const lines = [];
  lines.push(protocol.calming_line);

  if (protocol.emergency_call.should_call) {
    lines.push(protocol.emergency_call.instruction);
  }

  for (const [index, step] of selectedSteps.entries()) {
    const condition = step.condition ? ` (${step.condition})` : "";
    lines.push(`${index + 1}. ${renderInstruction(step.instruction_template, protocol, message)}${condition}`);
  }

  lines.push("Use only these steps from the verified protocol and stay with the person until help arrives.");

  return {
    message: lines.join("\n\n"),
    used_step_ids: selectedSteps.map((step) => step.id),
    call_emergency: protocol.emergency_call.should_call,
    generated_by: generatedBy,
    grounding: {
      protocol_id: protocol.scenario_id,
      protocol_version: protocol.version,
      source: protocol.source,
      validation
    }
  };
}

export function renderInstruction(template, protocol, userMessage) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, slot) => {
    const substitution = protocol.allowed_substitutions?.[slot];
    if (!substitution) {
      return `{${slot}}`;
    }

    return findMentionedSubstitution(substitution, userMessage) || substitution.default;
  });
}

export function validateModelGuidance(candidate, protocol) {
  const warnings = [];

  if (!candidate || typeof candidate !== "object") {
    return { passed: false, warnings: ["Guidance is not an object."] };
  }

  if (typeof candidate.message !== "string" || candidate.message.trim().length === 0) {
    warnings.push("message must be a non-empty string.");
  }

  if (candidate.message?.length > MAX_GUIDANCE_LENGTH) {
    warnings.push("message is too long.");
  }

  if (!Array.isArray(candidate.used_step_ids) || candidate.used_step_ids.length === 0) {
    warnings.push("used_step_ids must be a non-empty array.");
  }

  const allowedStepIds = new Set(protocol.steps.map((step) => step.id));
  const unknownStepIds = (candidate.used_step_ids || []).filter((stepId) => !allowedStepIds.has(stepId));
  if (unknownStepIds.length > 0) {
    warnings.push(`Unknown step ids: ${unknownStepIds.join(", ")}.`);
  }

  if (typeof candidate.call_emergency !== "boolean") {
    warnings.push("call_emergency must be boolean.");
  }

  const blocked = blockedPhraseHits(candidate.message || "", protocol);
  if (blocked.length > 0) {
    warnings.push(`Blocked phrases present: ${blocked.join(", ")}.`);
  }

  return {
    passed: warnings.length === 0,
    warnings
  };
}

async function generateWithGemini({ message, protocol, geminiClient, image }) {
  const systemInstruction = [
    "You are a first-aid communication assistant inside a safety-critical app.",
    "The protocol JSON is the only allowed source of first-aid instructions.",
    "Do not invent, add, reorder into unsafe priority, or merge procedures from memory.",
    "If an image is provided, use visible details only to decide which protocol-supported wording is relevant.",
    "Do not diagnose from the image or give image-only instructions outside the protocol.",
    "Adapt wording calmly to the user's situation only when an allowed substitution matches.",
    "Return only valid JSON matching the requested shape.",
    "Every action sentence must be supported by one or more used_step_ids from the protocol.",
    "If the protocol does not answer something, say that the verified protocol does not cover it and recommend emergency services for immediate danger."
  ].join("\n");

  const userText = stableJson({
    user_message: message || "(No written message. User uploaded an image.)",
    image: imagePromptSummary(image) || { present: false },
    protocol,
    response_shape: {
      message: "calm concise answer using only this protocol",
      used_step_ids: ["step ids used in the answer"],
      call_emergency: "boolean",
      missing_info: ["important unknowns, if any"]
    }
  });

  try {
    const candidate = await geminiClient.generateJson({
      systemInstruction,
      userText,
      inlineImages: image ? [image] : [],
      temperature: 0.05,
      maxOutputTokens: 900
    });

    const validation = validateModelGuidance(candidate, protocol);
    if (!validation.passed) {
      return { valid: false, validation };
    }

    return {
      valid: true,
      answer: {
        message: candidate.message.trim(),
        used_step_ids: [...new Set(candidate.used_step_ids)],
        call_emergency: candidate.call_emergency,
        generated_by: "gemini",
        grounding: {
          protocol_id: protocol.scenario_id,
          protocol_version: protocol.version,
          source: protocol.source,
          validation
        },
        missing_info: Array.isArray(candidate.missing_info) ? candidate.missing_info : []
      }
    };
  } catch (error) {
    return {
      valid: false,
      validation: {
        passed: false,
        warnings: [error.message]
      }
    };
  }
}

function findMentionedSubstitution(substitution, userMessage) {
  const normalizedMessage = userMessage.toLowerCase();
  for (const item of substitution.items || []) {
    if (item.match?.some((term) => normalizedMessage.includes(term.toLowerCase()))) {
      return item.label;
    }
  }
  return null;
}

function blockedPhraseHits(message, protocol) {
  const normalized = message.toLowerCase();
  return (protocol.blocked_phrases || []).filter((phrase) => normalized.includes(phrase.toLowerCase()));
}
