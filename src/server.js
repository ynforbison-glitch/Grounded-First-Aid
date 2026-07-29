import http from "node:http";
import { randomUUID } from "node:crypto";
import { appendChatTurns, buildConversationContext, normalizeChatHistory } from "./chatContext.js";
import { config } from "./config.js";
import { classifyScenario } from "./classifier.js";
import { GeminiClient } from "./geminiClient.js";
import { generateGroundedGuidance } from "./groundedResponder.js";
import { loadProtocolLibrary, protocolSummary } from "./protocolStore.js";
import { readJsonBody, sendError, sendJson, sendOptions, serveStatic } from "./http.js";
import { imagePromptSummary, normalizeUploadedImage } from "./uploadedImage.js";

const protocolLibrary = await loadProtocolLibrary();
const geminiClient = new GeminiClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  enabled: config.useGemini
});
const chatSessions = new Map();
const maxChatSessions = 100;

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendOptions(response);
      return;
    }

    const url = new URL(request.url, "http://localhost");

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        protocol_count: protocolLibrary.list().length,
        gemini_configured: geminiClient.available,
        model: config.geminiModel
      });
      return;
    }

    if (url.pathname === "/api/protocols" && request.method === "GET") {
      sendJson(response, 200, {
        protocols: protocolLibrary.list()
      });
      return;
    }

    if (url.pathname.startsWith("/api/protocols/") && request.method === "GET") {
      const scenarioId = decodeURIComponent(url.pathname.split("/").pop());
      const protocol = protocolLibrary.get(scenarioId);
      if (!protocol) {
        sendJson(response, 404, {
          error: {
            message: `Unknown protocol: ${scenarioId}`,
            statusCode: 404
          }
        });
        return;
      }

      sendJson(response, 200, { protocol });
      return;
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await readJsonBody(request, config.maxBodyBytes);
      const message = String(body.message || "").trim();
      const image = normalizeUploadedImage(body.image);

      if (!message && !image) {
        sendJson(response, 400, {
          error: {
            message: "message or image is required",
            statusCode: 400
          }
        });
        return;
      }

      const sessionId = getSessionId(body.session_id);
      const clientHistory = normalizeChatHistory(body.history);
      const storedHistory = chatSessions.get(sessionId) || [];
      const history = clientHistory.length > 0 ? clientHistory : storedHistory;
      const payload = await createGuidancePayload({ message, history, image });
      const userHistoryContent = image
        ? `${message || "Uploaded an image for first-aid guidance."} [Image: ${image.name || image.mimeType}]`
        : message;
      const nextHistory = appendChatTurns(history, [
        { role: "user", content: userHistoryContent },
        { role: "assistant", content: payload.answer.message }
      ]);

      setChatSession(sessionId, nextHistory);
      sendJson(response, 200, {
        ...payload,
        session_id: sessionId,
        conversation: {
          ...(payload.conversation || {}),
          turn_count: nextHistory.length
        }
      });
      return;
    }

    if (url.pathname === "/api/first-aid" && request.method === "POST") {
      const body = await readJsonBody(request, config.maxBodyBytes);
      const message = String(body.message || "").trim();
      const image = normalizeUploadedImage(body.image);

      if (!message && !image) {
        sendJson(response, 400, {
          error: {
            message: "message or image is required",
            statusCode: 400
          }
        });
        return;
      }

      sendJson(response, 200, await createGuidancePayload({ message, image }));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, {
        error: {
          message: "API route not found",
          statusCode: 404
        }
      });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Grounded First Aid running on http://${config.host}:${config.port}`);
  console.log(`Protocols loaded: ${protocolLibrary.scenarioIds().join(", ")}`);
  console.log(`Gemini configured: ${geminiClient.available ? "yes" : "no"}`);
});

async function createGuidancePayload({ message, history = [], image = null }) {
  let classification = await classifyScenario({
    message,
    protocolLibrary,
    geminiClient,
    image
  });
  let guidanceMessage = message;
  let contextUsed = false;
  const chatHistory = normalizeChatHistory(history);

  if (classification.scenario_id === "unknown" && chatHistory.length > 0) {
    const contextMessage = buildConversationContext(chatHistory, message);
    const contextClassification = await classifyScenario({
      message: contextMessage,
      protocolLibrary,
      geminiClient,
      image
    });

    if (contextClassification.scenario_id !== "unknown") {
      classification = {
        ...contextClassification,
        source: `${contextClassification.source}_conversation`,
        rationale: `${contextClassification.rationale} Used recent conversation for this follow-up.`
      };
      guidanceMessage = contextMessage;
      contextUsed = true;
    }
  }

  if (classification.scenario_id === "unknown") {
    return {
      classification,
      answer: {
        message:
          image
            ? "I could not match the uploaded image and message to a verified protocol in the current library. If there is immediate danger, call emergency services now."
            : "I could not match this to a verified protocol in the current library. If there is immediate danger, call emergency services now.",
        used_step_ids: [],
        call_emergency: true,
        generated_by: "system_guardrail",
        grounding: {
          protocol_id: null,
          validation: {
            passed: true,
            warnings: ["No protocol selected, so no first-aid steps were generated."]
          }
        }
      },
      available_protocols: protocolLibrary.list().map(({ scenario_id, title }) => ({
        scenario_id,
        title
      })),
      conversation: {
        context_used: contextUsed
      },
      image: imagePromptSummary(image)
    };
  }

  const protocol = protocolLibrary.get(classification.scenario_id);
  const answer = await generateGroundedGuidance({
    message: guidanceMessage,
    protocol,
    geminiClient,
    image
  });

  return {
    classification,
    answer,
    protocol: protocolSummary(protocol),
    conversation: {
      context_used: contextUsed
    },
    image: imagePromptSummary(image)
  };
}

function getSessionId(value) {
  const id = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(id)) {
    return id;
  }
  return randomUUID();
}

function setChatSession(sessionId, history) {
  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
  }
  chatSessions.set(sessionId, history);

  while (chatSessions.size > maxChatSessions) {
    chatSessions.delete(chatSessions.keys().next().value);
  }
}
