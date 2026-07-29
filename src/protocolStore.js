import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const defaultProtocolsDir = fileURLToPath(new URL("../protocols", import.meta.url));

export async function loadProtocolLibrary(protocolsDir = defaultProtocolsDir) {
  const files = (await readdir(protocolsDir))
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const protocols = new Map();
  const validationErrors = [];

  for (const file of files) {
    const fullPath = path.join(protocolsDir, file);
    const raw = await readFile(fullPath, "utf8");
    const protocol = JSON.parse(raw);
    const errors = validateProtocol(protocol);

    if (errors.length > 0) {
      validationErrors.push({ file, errors });
      continue;
    }

    if (protocols.has(protocol.scenario_id)) {
      validationErrors.push({
        file,
        errors: [`Duplicate scenario_id: ${protocol.scenario_id}`]
      });
      continue;
    }

    protocols.set(protocol.scenario_id, Object.freeze(protocol));
  }

  if (validationErrors.length > 0) {
    const details = validationErrors
      .map((item) => `${item.file}: ${item.errors.join("; ")}`)
      .join("\n");
    throw new Error(`Protocol validation failed:\n${details}`);
  }

  return Object.freeze({
    protocols,
    list: () => [...protocols.values()].map(protocolSummary),
    get: (scenarioId) => protocols.get(scenarioId),
    has: (scenarioId) => protocols.has(scenarioId),
    scenarioIds: () => [...protocols.keys()]
  });
}

export function protocolSummary(protocol) {
  return {
    scenario_id: protocol.scenario_id,
    title: protocol.title,
    risk_level: protocol.risk_level,
    version: protocol.version,
    source: protocol.source,
    step_count: protocol.steps.length,
    classification_hints: protocol.classification_hints
  };
}

export function validateProtocol(protocol) {
  const errors = [];

  requireString(protocol, "scenario_id", errors);
  requireString(protocol, "title", errors);
  requireString(protocol, "risk_level", errors);
  requireString(protocol, "calming_line", errors);

  if (!protocol.source || typeof protocol.source !== "object") {
    errors.push("source must be an object");
  } else {
    for (const field of ["organization", "document", "section", "url", "reviewed_at"]) {
      requireString(protocol.source, field, errors, `source.${field}`);
    }
    if (!Number.isInteger(protocol.source.year)) {
      errors.push("source.year must be an integer");
    }
  }

  if (!Array.isArray(protocol.classification_hints) || protocol.classification_hints.length === 0) {
    errors.push("classification_hints must be a non-empty array");
  }

  if (!protocol.emergency_call || typeof protocol.emergency_call !== "object") {
    errors.push("emergency_call must be an object");
  } else {
    if (typeof protocol.emergency_call.should_call !== "boolean") {
      errors.push("emergency_call.should_call must be boolean");
    }
    requireString(protocol.emergency_call, "instruction", errors, "emergency_call.instruction");
  }

  if (!protocol.allowed_substitutions || typeof protocol.allowed_substitutions !== "object") {
    errors.push("allowed_substitutions must be an object");
  }

  if (!Array.isArray(protocol.steps) || protocol.steps.length === 0) {
    errors.push("steps must be a non-empty array");
  } else {
    const seenStepIds = new Set();
    for (const [index, step] of protocol.steps.entries()) {
      requireString(step, "id", errors, `steps[${index}].id`);
      requireString(
        step,
        "instruction_template",
        errors,
        `steps[${index}].instruction_template`
      );
      if (!Number.isInteger(step.priority)) {
        errors.push(`steps[${index}].priority must be an integer`);
      }
      if (typeof step.default_included !== "boolean") {
        errors.push(`steps[${index}].default_included must be boolean`);
      }
      if (seenStepIds.has(step.id)) {
        errors.push(`Duplicate step id: ${step.id}`);
      }
      seenStepIds.add(step.id);
    }
  }

  if (!Array.isArray(protocol.do_not_say)) {
    errors.push("do_not_say must be an array");
  }

  return errors;
}

function requireString(object, field, errors, label = field) {
  const value = object?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} must be a non-empty string`);
  }
}
