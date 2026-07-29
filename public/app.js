const form = document.querySelector("#aid-form");
const messageInput = document.querySelector("#message");
const statusEl = document.querySelector("#status");
const answerEl = document.querySelector("#answer");
const traceEl = document.querySelector("#trace");
const clearButton = document.querySelector("#clear");
const submitButton = document.querySelector("#submit");
const protocolListEl = document.querySelector("#protocol-list");
const charCountEl = document.querySelector("#char-count");
const confidenceValueEl = document.querySelector("#confidence-value");
const modelStateEl = document.querySelector("#model-state");
const voiceBarEl = document.querySelector("#voice-bar");
const voiceButton = document.querySelector("#voice-toggle");
const voiceStatusEl = document.querySelector("#voice-status");
const followUpActionsEl = document.querySelector("#follow-up-actions");
const autoSendVoiceEl = document.querySelector("#auto-send-voice");
const speakRepliesEl = document.querySelector("#speak-replies");
const replayVoiceButton = document.querySelector("#replay-voice");
const stopVoiceButton = document.querySelector("#stop-voice");
const imageUploaderEl = document.querySelector("#image-uploader");
const imageInputEl = document.querySelector("#image-input");
const imagePreviewEl = document.querySelector("#image-preview");
const imagePreviewImgEl = document.querySelector("#image-preview-img");
const imagePreviewNameEl = document.querySelector("#image-preview-name");
const imagePreviewMetaEl = document.querySelector("#image-preview-meta");
const imageRemoveButton = document.querySelector("#image-remove");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSynth = window.speechSynthesis;
const SpeechUtterance = window.SpeechSynthesisUtterance;
const sessionStorageKey = "grounded-first-aid-session";
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 4 * 1024 * 1024;
const maxClientHistory = 10;
let recognition = null;
let isListening = false;
let isSpeaking = false;
let voiceBaseText = "";
let finalTranscript = "";
let suppressNextVoiceSubmit = false;
let resumeVoiceAfterSpeech = false;
let lastSpokenText = "";
let selectedImage = null;
let sessionId = loadSessionId();
let messageHistory = [];

loadRuntimeStatus();
loadProtocolLibrary();
updateCharacterCount();
setupVoiceInput();
setupVoiceOutput();
hideFollowUps();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(messageInput.value.trim());
});

clearButton.addEventListener("click", () => {
  stopVoiceInput({ suppressAutoSubmit: true });
  stopSpeaking();
  messageInput.value = "";
  clearSelectedImage();
  messageHistory = [];
  lastSpokenText = "";
  sessionId = createSessionId();
  saveSessionId(sessionId);
  renderEmptyState();
  traceEl.innerHTML = "";
  confidenceValueEl.textContent = "--";
  setStatus("Ready", "");
  updateCharacterCount();
  hideFollowUps();
  updateSpeechButtons();
  messageInput.focus();
});

messageInput.addEventListener("input", updateCharacterCount);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

voiceButton.addEventListener("click", () => {
  if (!recognition) {
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  startVoiceInput();
});

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.sample;
    updateCharacterCount();
    messageInput.focus();
  });
});

protocolListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hint]");
  if (!button) {
    return;
  }

  messageInput.value = button.dataset.hint;
  updateCharacterCount();
  messageInput.focus();
});

followUpActionsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-follow-up]");
  if (!button || button.disabled) {
    return;
  }

  sendMessage(button.dataset.followUp);
});

imageInputEl.addEventListener("change", () => {
  handleImageFile(imageInputEl.files?.[0]);
});

imageRemoveButton.addEventListener("click", clearSelectedImage);

imageUploaderEl.addEventListener("dragover", (event) => {
  event.preventDefault();
  imageUploaderEl.classList.add("dragging");
});

imageUploaderEl.addEventListener("dragleave", () => {
  imageUploaderEl.classList.remove("dragging");
});

imageUploaderEl.addEventListener("drop", (event) => {
  event.preventDefault();
  imageUploaderEl.classList.remove("dragging");
  handleImageFile(event.dataTransfer?.files?.[0]);
});

replayVoiceButton.addEventListener("click", () => {
  speakText(lastSpokenText, { force: true });
});

stopVoiceButton.addEventListener("click", stopSpeaking);

autoSendVoiceEl.addEventListener("change", () => {
  if (autoSendVoiceEl.checked && !speakRepliesEl.disabled) {
    speakRepliesEl.checked = true;
  }

  if (!autoSendVoiceEl.checked) {
    resumeVoiceAfterSpeech = false;
  }
});

speakRepliesEl.addEventListener("change", () => {
  if (!speakRepliesEl.checked) {
    autoSendVoiceEl.checked = false;
    stopSpeaking();
    setVoiceState(recognition ? "AI voice off" : "Voice unavailable", recognition ? "" : "unsupported");
  } else {
    speakText("AI voice is on.", { force: true, systemCue: true });
  }
  updateSpeechButtons();
});

async function sendMessage(message) {
  const imageForRequest = selectedImage ? requestImagePayload(selectedImage) : null;
  const imageForDisplay = selectedImage;

  if (!message && !imageForRequest) {
    return;
  }

  const historyForRequest = messageHistory.slice(-maxClientHistory);
  const displayMessage = message || "Uploaded an image for first-aid guidance.";
  stopVoiceInput({ suppressAutoSubmit: true });
  stopSpeaking();
  appendUserMessage(displayMessage, imageForDisplay);
  messageInput.value = "";
  clearSelectedImage();
  updateCharacterCount();
  setLoading(true);
  setStatus(imageForRequest ? "AI reviewing image..." : "AI responding...", "loading");
  confidenceValueEl.textContent = "--";
  hideFollowUps();
  const typingEl = appendTypingMessage();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        image: imageForRequest,
        history: historyForRequest
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || "Request failed");
    }

    if (data.session_id) {
      sessionId = data.session_id;
      saveSessionId(sessionId);
    }

    typingEl.remove();
    appendAssistantMessage(data);
    speakText(data.answer?.message || "");
    messageHistory = trimHistory([
      ...messageHistory,
      {
        role: "user",
        content: imageForDisplay
          ? `${displayMessage} [Image: ${imageForDisplay.name || imageForDisplay.mime_type}]`
          : displayMessage
      },
      { role: "assistant", content: data.answer?.message || "" }
    ]);
    setStatus(data.conversation?.context_used ? "Follow-up grounded" : "Grounded", "");
    showFollowUps();
  } catch (error) {
    typingEl.remove();
    appendErrorMessage(error);
    messageHistory = trimHistory([...messageHistory, { role: "user", content: message }]);
    setStatus(error.message, "error");
  } finally {
    setLoading(false);
    messageInput.focus();
  }
}

async function handleImageFile(file) {
  if (!file) {
    return;
  }

  if (!supportedImageTypes.has(file.type)) {
    setStatus("Upload a JPEG, PNG, or WebP image.", "error");
    return;
  }

  if (file.size > maxImageBytes) {
    setStatus("Image must be 4 MB or smaller.", "error");
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    selectedImage = {
      data: dataUrl.split(",")[1] || "",
      dataUrl,
      mime_type: file.type,
      name: file.name,
      size: file.size
    };
    renderSelectedImage();
    setStatus("Image ready", "");
  } catch {
    setStatus("Could not read image.", "error");
  }
}

function renderSelectedImage() {
  if (!selectedImage) {
    imagePreviewEl.hidden = true;
    imagePreviewImgEl.removeAttribute("src");
    imagePreviewNameEl.textContent = "Selected image";
    imagePreviewMetaEl.textContent = "";
    return;
  }

  imagePreviewImgEl.src = selectedImage.dataUrl;
  imagePreviewNameEl.textContent = selectedImage.name || "Uploaded image";
  imagePreviewMetaEl.textContent = `${selectedImage.mime_type.replace("image/", "").toUpperCase()} · ${formatBytes(selectedImage.size)}`;
  imagePreviewEl.hidden = false;
}

function clearSelectedImage() {
  selectedImage = null;
  imageInputEl.value = "";
  renderSelectedImage();
}

function requestImagePayload(image) {
  return {
    data: image.data,
    mime_type: image.mime_type,
    name: image.name
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function setupVoiceInput() {
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.title = "Voice input unavailable";
    voiceButton.setAttribute("aria-label", "Voice input unavailable");
    setVoiceState("Voice unavailable", "unsupported");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.addEventListener("start", () => {
    isListening = true;
    finalTranscript = "";
    voiceBaseText = messageInput.value.trim();
    voiceButton.setAttribute("aria-pressed", "true");
    voiceButton.setAttribute("aria-label", "Stop voice message");
    voiceButton.title = "Stop voice message";
    setVoiceState("Listening", "listening");
  });

  recognition.addEventListener("result", (event) => {
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || "";

      if (result.isFinal) {
        finalTranscript = joinTranscript(finalTranscript, transcript);
      } else {
        interimTranscript = joinTranscript(interimTranscript, transcript);
      }
    }

    messageInput.value = joinTranscript(voiceBaseText, finalTranscript, interimTranscript);
    updateCharacterCount();
  });

  recognition.addEventListener("end", () => {
    const voiceText = messageInput.value.trim();
    const shouldAutoSubmit =
      autoSendVoiceEl.checked && !suppressNextVoiceSubmit && voiceText && voiceText !== voiceBaseText;

    isListening = false;
    voiceBaseText = voiceText;
    suppressNextVoiceSubmit = false;
    voiceButton.setAttribute("aria-pressed", "false");
    voiceButton.setAttribute("aria-label", "Start voice message");
    voiceButton.title = "Start voice message";

    if (!voiceBarEl.classList.contains("error")) {
      setVoiceState(
        shouldAutoSubmit ? "Sending voice" : voiceText ? "Voice added" : "Ready to listen",
        ""
      );
    }

    if (shouldAutoSubmit) {
      form.requestSubmit();
    }
  });

  recognition.addEventListener("error", (event) => {
    const errorMessages = {
      "not-allowed": "Microphone blocked",
      "audio-capture": "Microphone unavailable",
      "no-speech": "No speech heard",
      network: "Voice network error"
    };

    setVoiceState(errorMessages[event.error] || "Voice input stopped", "error");
  });

  setVoiceState("Ready to listen", "");
}

function startVoiceInput() {
  if (!recognition) {
    return;
  }

  stopSpeaking();
  suppressNextVoiceSubmit = false;

  try {
    recognition.start();
  } catch {
    setVoiceState("Already listening", "listening");
  }
}

function stopVoiceInput({ suppressAutoSubmit = false } = {}) {
  if (recognition && isListening) {
    suppressNextVoiceSubmit = suppressAutoSubmit;
    recognition.stop();
  }
}

function setVoiceState(message, state) {
  voiceStatusEl.textContent = message;
  voiceBarEl.className = `voice-bar ${state}`.trim();
}

function setupVoiceOutput() {
  if (!speechSynth || !SpeechUtterance) {
    speakRepliesEl.checked = false;
    speakRepliesEl.disabled = true;
    replayVoiceButton.disabled = true;
    stopVoiceButton.disabled = true;
    replayVoiceButton.title = "Spoken replies unavailable";
    stopVoiceButton.title = "Spoken replies unavailable";
    setVoiceState("AI voice unavailable", "unsupported");
    return;
  }

  setVoiceState(recognition ? "AI voice ready" : "AI voice ready, mic unavailable", recognition ? "" : "unsupported");
  updateSpeechButtons();
}

function speakText(text, { force = false, systemCue = false } = {}) {
  const speechText = prepareSpeechText(text);

  if (!speechText || !speechSynth || !SpeechUtterance) {
    return;
  }

  lastSpokenText = speechText;
  updateSpeechButtons();

  if (!force && !speakRepliesEl.checked) {
    return;
  }

  stopSpeaking({ keepState: true });
  const utterance = new SpeechUtterance(speechText);
  utterance.rate = 0.95;
  utterance.pitch = 1;

  utterance.addEventListener("start", () => {
    isSpeaking = true;
    resumeVoiceAfterSpeech = !systemCue && autoSendVoiceEl.checked;
    setVoiceState("Speaking reply", "speaking");
    updateSpeechButtons();
  });

  utterance.addEventListener("end", () => {
    const shouldResumeVoice = resumeVoiceAfterSpeech && autoSendVoiceEl.checked && recognition;
    isSpeaking = false;
    resumeVoiceAfterSpeech = false;
    setVoiceState(
      shouldResumeVoice ? "Listening again" : recognition ? "Ready to listen" : "Voice unavailable",
      recognition ? "" : "unsupported"
    );
    updateSpeechButtons();

    if (shouldResumeVoice) {
      window.setTimeout(() => {
        if (autoSendVoiceEl.checked && !isListening && !isSpeaking) {
          startVoiceInput();
        }
      }, 450);
    }
  });

  utterance.addEventListener("error", () => {
    isSpeaking = false;
    resumeVoiceAfterSpeech = false;
    setVoiceState("Speech playback stopped", "error");
    updateSpeechButtons();
  });

  speechSynth.speak(utterance);
}

function stopSpeaking({ keepState = false } = {}) {
  if (!speechSynth) {
    return;
  }

  if (speechSynth.speaking || speechSynth.pending) {
    speechSynth.cancel();
  }

  resumeVoiceAfterSpeech = false;
  isSpeaking = false;
  if (!keepState && !isListening) {
    setVoiceState(recognition ? "Ready to listen" : "Voice unavailable", recognition ? "" : "unsupported");
  }
  updateSpeechButtons();
}

function updateSpeechButtons() {
  const supported = Boolean(speechSynth && SpeechUtterance);
  replayVoiceButton.disabled = !supported || !lastSpokenText || isSpeaking;
  stopVoiceButton.disabled = !supported || !isSpeaking;
}

function prepareSpeechText(text) {
  return String(text || "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\b([A-Z]{2})-(\d+)\b/g, "step $1 $2")
    .trim()
    .slice(0, 1400);
}

function joinTranscript(...parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1");
}

async function loadRuntimeStatus() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    if (data.gemini_configured) {
      modelStateEl.innerHTML = `<span class="pulse" aria-hidden="true"></span>${escapeHtml(data.model || "Gemini ready")}`;
      modelStateEl.className = "runtime-pill";
      return;
    }

    modelStateEl.innerHTML = `<span class="pulse" aria-hidden="true"></span>Protocol renderer`;
    modelStateEl.className = "runtime-pill unavailable";
  } catch {
    modelStateEl.innerHTML = `<span class="pulse" aria-hidden="true"></span>Runtime unavailable`;
    modelStateEl.className = "runtime-pill unavailable";
  }
}

async function loadProtocolLibrary() {
  try {
    const response = await fetch("/api/protocols");
    const data = await response.json();
    const protocols = Array.isArray(data.protocols) ? data.protocols : [];

    if (protocols.length === 0) {
      protocolListEl.innerHTML = `<p class="validation-note">No protocols loaded.</p>`;
      return;
    }

    protocolListEl.innerHTML = protocols
      .map((protocol) => {
        const hint = protocol.classification_hints?.[0] || protocol.title;
        return `
          <button class="protocol-row" type="button" data-hint="${escapeAttribute(hint)}">
            <span>
              <strong>${escapeHtml(protocol.title)}</strong>
              <span>${escapeHtml(protocol.source?.organization || "Verified source")}</span>
            </span>
            <span class="protocol-tag">${escapeHtml(String(protocol.step_count || 0))} steps</span>
          </button>
        `;
      })
      .join("");
  } catch {
    protocolListEl.innerHTML = `<p class="validation-note">Protocol library unavailable.</p>`;
  }
}

function appendUserMessage(message, image = null) {
  const log = ensureChatLog();
  const messageEl = document.createElement("div");
  messageEl.className = "chat-message user";
  messageEl.innerHTML = `
    <div class="chat-bubble">
      ${
        image
          ? `<img class="chat-image" src="${escapeAttribute(image.dataUrl)}" alt="${escapeAttribute(image.name || "Uploaded image")}" />`
          : ""
      }
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  log.append(messageEl);
  scrollChatToEnd();
}

function appendTypingMessage() {
  const log = ensureChatLog();
  const messageEl = document.createElement("div");
  messageEl.className = "chat-message assistant typing";
  messageEl.innerHTML = `
    <div class="chat-bubble">
      <span class="typing-dots" aria-label="Assistant is responding">
        <i></i>
        <i></i>
        <i></i>
      </span>
    </div>
  `;
  log.append(messageEl);
  scrollChatToEnd();
  return messageEl;
}

function appendAssistantMessage(data) {
  const log = ensureChatLog();
  const answer = data.answer || {};
  const protocol = data.protocol || {};
  const grounding = answer.grounding || {};
  const source = protocol.source || grounding.source || {};
  const guidance = parseGuidance(answer.message || "");
  const confidence = formatConfidence(data.classification?.confidence);
  const isUnknown = !protocol.title && data.available_protocols;
  const title = isUnknown
    ? "No protocol match"
    : protocol.title || grounding.protocol_id || "Grounded response";

  confidenceValueEl.textContent = confidence;

  const messageEl = document.createElement("div");
  messageEl.className = "chat-message assistant";
  messageEl.innerHTML = `
    <div class="chat-bubble">
      <header class="chat-response-header">
        <div>
          <p class="eyebrow">${isUnknown ? "System guardrail" : "Selected protocol"}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${answer.call_emergency ? `<span class="call-badge">Call emergency services</span>` : ""}
      </header>
      ${renderGuidanceBody(guidance, isUnknown)}
      ${renderAssistantMeta(data, source)}
      ${isUnknown ? renderUnknownProtocols(data.available_protocols) : ""}
    </div>
  `;
  log.append(messageEl);
  traceEl.innerHTML = renderTrace(data);
  scrollChatToEnd();
}

function appendErrorMessage(error) {
  const log = ensureChatLog();
  const messageEl = document.createElement("div");
  messageEl.className = "chat-message assistant";
  messageEl.innerHTML = `
    <div class="chat-bubble error-card">
      <h2>Request failed</h2>
      <p>${escapeHtml(error.message || "Something went wrong.")}</p>
    </div>
  `;
  log.append(messageEl);
  traceEl.innerHTML = "";
  scrollChatToEnd();
}

function renderGuidanceBody(guidance, isUnknown) {
  if (isUnknown) {
    const text = guidance.lead || guidance.notes.join(" ") || "No verified protocol matched this message.";
    return `<p class="lead">${escapeHtml(text)}</p>`;
  }

  return `
    ${guidance.lead ? `<p class="lead">${escapeHtml(guidance.lead)}</p>` : ""}
    ${
      guidance.steps.length > 0
        ? `<ol class="guidance-list">${guidance.steps.map((step) => `<li>${escapeHtml(step.text)}</li>`).join("")}</ol>`
        : guidance.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")
    }
    ${
      guidance.steps.length > 0 && guidance.notes.length > 0
        ? `<div class="closing-note">${guidance.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>`
        : ""
    }
  `;
}

function renderAssistantMeta(data, source) {
  const labels = [
    formatGeneratedBy(data.answer?.generated_by),
    data.conversation?.context_used ? "Follow-up context" : "",
    source.organization || ""
  ].filter(Boolean);

  if (labels.length === 0) {
    return "";
  }

  return `<div class="assistant-meta">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>`;
}

function renderUnknownProtocols(protocols = []) {
  if (!Array.isArray(protocols) || protocols.length === 0) {
    return "";
  }

  return `
    <div class="unknown-list">
      <h3>Available protocols</h3>
      <ul>${protocols.map((protocol) => `<li>${escapeHtml(protocol.title)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderTrace(data) {
  const answer = data.answer || {};
  const protocol = data.protocol || {};
  const grounding = answer.grounding || {};
  const source = protocol.source || grounding.source || {};
  const sourceLabel = source.organization || source.document || source.url || "None";
  const stepIds = Array.isArray(answer.used_step_ids) ? answer.used_step_ids : [];
  const warnings = grounding.validation?.warnings || [];

  return `
    <div class="trace-grid">
      ${renderTraceItem("Scenario", data.classification?.scenario_id || "unknown")}
      ${renderTraceItem("Generated by", answer.generated_by || "unknown")}
      ${renderTraceItem("Source", sourceLabel, source.url)}
    </div>
    ${
      stepIds.length > 0
        ? `<div class="step-chips">${stepIds.map((stepId) => `<span class="step-chip">${escapeHtml(stepId)}</span>`).join("")}</div>`
        : ""
    }
    ${warnings.length > 0 ? `<p class="validation-note">${escapeHtml(warnings.join(" "))}</p>` : ""}
  `;
}

function ensureChatLog() {
  if (!answerEl.classList.contains("chat")) {
    answerEl.className = "answer chat";
    answerEl.innerHTML = `<div class="chat-log"></div>`;
  }

  return answerEl.querySelector(".chat-log");
}

function scrollChatToEnd() {
  requestAnimationFrame(() => {
    answerEl.scrollTop = answerEl.scrollHeight;
  });
}

function renderEmptyState() {
  answerEl.className = "answer empty";
  answerEl.innerHTML = `
    <div class="empty-state">
      <img src="/aid-kit.svg" alt="" />
      <div>
        <p class="eyebrow">AI conversation</p>
        <h2>Ready when you are</h2>
        <p>Share the emergency in plain language, then keep asking follow-ups as the situation changes.</p>
      </div>
    </div>
  `;
}

function parseGuidance(message) {
  const lines = String(message)
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const lead = [];
  const steps = [];
  const notes = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.+)/);
    if (match) {
      steps.push({ number: Number.parseInt(match[1], 10), text: match[2] });
    } else if (steps.length === 0) {
      lead.push(line);
    } else {
      notes.push(line);
    }
  }

  return {
    lead: lead[0] || "",
    steps,
    notes: steps.length > 0 ? notes : lead.slice(1)
  };
}

function setStatus(message, className) {
  statusEl.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${escapeHtml(message)}`;
  statusEl.className = `status ${className}`.trim();
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  clearButton.disabled = isLoading;
  messageInput.disabled = isLoading;
  imageInputEl.disabled = isLoading;
  imageUploaderEl.classList.toggle("disabled", isLoading);
  imageRemoveButton.disabled = isLoading;
  voiceButton.disabled = isLoading || !recognition;
  followUpActionsEl.querySelectorAll("button").forEach((button) => {
    button.disabled = isLoading;
  });

  if (isLoading) {
    stopVoiceInput();
  }
}

function showFollowUps() {
  followUpActionsEl.hidden = false;
}

function hideFollowUps() {
  followUpActionsEl.hidden = true;
}

function updateCharacterCount() {
  const count = messageInput.value.length;
  charCountEl.textContent = `${count} ${count === 1 ? "character" : "characters"}`;
}

function renderTraceItem(label, value, url = "") {
  const valueHtml = url
    ? `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`
    : `<strong>${escapeHtml(value)}</strong>`;

  return `
    <div class="trace-item">
      <span>${escapeHtml(label)}</span>
      ${valueHtml}
    </div>
  `;
}

function formatConfidence(value) {
  if (typeof value !== "number") {
    return "--";
  }
  return `${Math.round(value * 100)}%`;
}

function formatGeneratedBy(value) {
  const labels = {
    gemini: "Gemini",
    protocol_renderer: "Protocol renderer",
    system_guardrail: "System guardrail"
  };
  return labels[value] || "";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trimHistory(history) {
  return history
    .filter((turn) => turn.content)
    .slice(-maxClientHistory)
    .map((turn) => ({
      role: turn.role,
      content: String(turn.content).slice(0, 1200)
    }));
}

function loadSessionId() {
  try {
    const existing = window.localStorage.getItem(sessionStorageKey);
    if (existing) {
      return existing;
    }
  } catch {
    return createSessionId();
  }

  const id = createSessionId();
  saveSessionId(id);
  return id;
}

function saveSessionId(id) {
  try {
    window.localStorage.setItem(sessionStorageKey, id);
  } catch {
    // Local storage is optional for this session.
  }
}

function createSessionId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
