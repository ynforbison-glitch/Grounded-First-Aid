import test from "node:test";
import assert from "node:assert/strict";
import { classifyWithKeywords } from "../src/classifier.js";
import { loadProtocolLibrary } from "../src/protocolStore.js";

test("classifies severe bleeding from user wording", async () => {
  const library = await loadProtocolLibrary();
  const result = classifyWithKeywords({
    message: "My friend cut his arm badly and blood is everywhere. We only have a T-shirt.",
    protocolLibrary: library
  });

  assert.equal(result.scenario_id, "severe_bleeding");
  assert.ok(result.confidence > 0.6);
});

test("classifies adult choking from user wording", async () => {
  const library = await loadProtocolLibrary();
  const result = classifyWithKeywords({
    message: "An adult is choking on food and cannot breathe.",
    protocolLibrary: library
  });

  assert.equal(result.scenario_id, "choking_adult");
  assert.ok(result.confidence > 0.6);
});

test("returns unknown for unmatched messages", async () => {
  const library = await loadProtocolLibrary();
  const result = classifyWithKeywords({
    message: "I want to know what should be in a camping kit.",
    protocolLibrary: library
  });

  assert.equal(result.scenario_id, "unknown");
});
