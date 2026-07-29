export const MAX_CHAT_HISTORY = 10;
const MAX_TURN_LENGTH = 1200;
const allowedRoles = new Set(["user", "assistant"]);

export function normalizeChatHistory(history, maxTurns = MAX_CHAT_HISTORY) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((turn) => turn && allowedRoles.has(turn.role) && typeof turn.content === "string")
    .map((turn) => ({
      role: turn.role,
      content: truncateTurn(turn.content.trim())
    }))
    .filter((turn) => turn.content)
    .slice(-maxTurns);
}

export function buildConversationContext(history, latestMessage) {
  const turns = normalizeChatHistory(history);
  const latest = String(latestMessage || "").trim();

  if (turns.length === 0) {
    return latest;
  }

  const lines = turns.map((turn) => {
    const label = turn.role === "assistant" ? "Assistant" : "User";
    return `${label}: ${turn.content}`;
  });

  return ["Recent conversation:", ...lines, `Latest user message: ${truncateTurn(latest)}`].join("\n");
}

export function appendChatTurns(history, turns, maxTurns = MAX_CHAT_HISTORY) {
  return normalizeChatHistory([...normalizeChatHistory(history, maxTurns), ...turns], maxTurns);
}

function truncateTurn(content) {
  return content.length > MAX_TURN_LENGTH ? `${content.slice(0, MAX_TURN_LENGTH)}...` : content;
}
