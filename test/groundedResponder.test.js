import test from "node:test";
import assert from "node:assert/strict";
import { renderInstruction, renderProtocolGuidance, validateModelGuidance } from "../src/groundedResponder.js";
import { loadProtocolLibrary } from "../src/protocolStore.js";

test("renders allowed user substitution from protocol", async () => {
  const library = await loadProtocolLibrary();
  const protocol = library.get("severe_bleeding");
  const step = protocol.steps.find((item) => item.id === "SB-1");

  const instruction = renderInstruction(
    step.instruction_template,
    protocol,
    "We only have a T-shirt."
  );

  assert.match(instruction, /cleanest part of the T-shirt/);
});

test("fallback response cites only protocol step ids", async () => {
  const library = await loadProtocolLibrary();
  const protocol = library.get("severe_bleeding");
  const answer = renderProtocolGuidance({
    message: "Blood is everywhere and we have a shirt.",
    protocol
  });

  const allowed = new Set(protocol.steps.map((step) => step.id));
  assert.ok(answer.used_step_ids.length > 0);
  assert.equal(answer.used_step_ids.every((stepId) => allowed.has(stepId)), true);
});

test("model validation rejects blocked phrases", async () => {
  const library = await loadProtocolLibrary();
  const protocol = library.get("severe_bleeding");

  const validation = validateModelGuidance(
    {
      message: "Apply pressure point and wait before calling.",
      used_step_ids: ["SB-1"],
      call_emergency: true
    },
    protocol
  );

  assert.equal(validation.passed, false);
});
