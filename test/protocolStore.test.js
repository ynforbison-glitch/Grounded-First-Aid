import test from "node:test";
import assert from "node:assert/strict";
import { loadProtocolLibrary } from "../src/protocolStore.js";

test("loads and validates bundled protocols", async () => {
  const library = await loadProtocolLibrary();
  assert.equal(library.list().length, 3);
  assert.equal(library.has("severe_bleeding"), true);
  assert.equal(library.has("choking_adult"), true);
  assert.equal(library.has("unresponsive_breathing"), true);
});

test("protocol step ids are unique within each protocol", async () => {
  const library = await loadProtocolLibrary();

  for (const protocol of library.protocols.values()) {
    const ids = protocol.steps.map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length, protocol.scenario_id);
  }
});
