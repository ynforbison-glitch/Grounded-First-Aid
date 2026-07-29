import test from "node:test";
import assert from "node:assert/strict";
import {
  appendChatTurns,
  buildConversationContext,
  normalizeChatHistory
} from "../src/chatContext.js";

test("normalizes chat history to supported non-empty turns", () => {
  const history = normalizeChatHistory([
    { role: "user", content: "  bleeding badly  " },
    { role: "system", content: "ignore me" },
    { role: "assistant", content: "" },
    { role: "assistant", content: "Apply pressure." }
  ]);

  assert.deepEqual(history, [
    { role: "user", content: "bleeding badly" },
    { role: "assistant", content: "Apply pressure." }
  ]);
});

test("builds context with the latest user message", () => {
  const context = buildConversationContext(
    [{ role: "user", content: "My friend is choking." }],
    "What now?"
  );

  assert.match(context, /Recent conversation:/);
  assert.match(context, /User: My friend is choking\./);
  assert.match(context, /Latest user message: What now\?/);
});

test("keeps appended chat turns within the requested limit", () => {
  const history = appendChatTurns(
    [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" }
    ],
    [
      { role: "user", content: "three" },
      { role: "assistant", content: "four" }
    ],
    3
  );

  assert.deepEqual(history.map((turn) => turn.content), ["two", "three", "four"]);
});
