# Grounded First Aid

**Grounded First Aid** is an AI-powered emergency guidance platform that delivers **source-verified, protocol-driven first aid assistance** in real time.

Unlike conventional AI assistants that generate medical advice from model memory alone, Grounded First Aid treats the language model as a **communication layer, not the medical authority**.

For every request, the platform:

* Classifies the emergency scenario.
* Retrieves the appropriate evidence-based first aid protocol from a curated protocol library.
* Grounds the AI's response using authoritative medical guidance.
* Validates the model's structured output against a predefined schema.
* Automatically falls back to deterministic, protocol-based instructions whenever the AI is unavailable or produces an invalid response.

This architecture ensures that every response remains **consistent, traceable, auditable, and aligned with trusted medical sources**, significantly reducing the risk of AI hallucinations.

## Why It Matters

Current generative AI systems are powerful but unreliable in high-stakes medical situations because they can produce confident, inaccurate guidance.

Grounded First Aid addresses this challenge by combining:

* Evidence-backed clinical protocols
* Retrieval-grounded AI
* Structured response validation
* Deterministic failover
* Explainable, source-attributed guidance

The result is a safety-first architecture designed for environments where reliability is more important than creativity.

## Vision

Grounded First Aid is building the infrastructure for trustworthy AI assistance in emergency response, creating a platform that can support individuals, humanitarian organizations, educational institutions, and healthcare providers with reliable, transparent, and protocol-driven guidance when every second matters.


## Run

```bash
cp .env.example .env
# Add GEMINI_API_KEY if you want live Gemini responses.
node src/server.js
```

Open `http://127.0.0.1:3000`.

No package install is required because this implementation uses only Node.js built-ins.

## API

### `POST /api/first-aid`

```json
{
  "message": "My friend cut his arm badly and blood is everywhere. We only have a T-shirt."
}
```

Returns:

```json
{
  "classification": {
    "scenario_id": "severe_bleeding",
    "confidence": 0.95,
    "source": "keyword"
  },
  "answer": {
    "message": "...",
    "used_step_ids": ["SB-1", "SB-2"],
    "call_emergency": true,
    "generated_by": "protocol_renderer"
  },
  "protocol": {
    "scenario_id": "severe_bleeding",
    "title": "Severe external bleeding",
    "source": {}
  }
}
```

### `GET /api/protocols`

Lists the available protocol summaries.

### `GET /api/protocols/:scenario_id`

Returns one full protocol JSON file.


## Production Readiness

The current protocol library is built from authoritative public first aid guidance and serves as a validated foundation for the platform. Before production deployment, every protocol undergoes clinical review and quality assurance to ensure medical accuracy, regulatory compliance, and regional applicability.

Each protocol is versioned and includes:

* Source organization and publication details
* Document version and publication date
* Section and page references
* Clinical reviewer approval and review history
* Localization and jurisdiction metadata
* Effective and revision dates for auditability

## Safety Architecture

Grounded First Aid is designed with multiple layers of safeguards to ensure every response is reliable, explainable, and traceable.

Every request follows a controlled pipeline:

* Classify the request into a predefined emergency scenario.
* Retrieve only the matching evidence-based protocol.
* Ground the AI exclusively on the selected protocol.
* Require structured JSON output with references to the protocol steps used.
* Reject responses that fail schema validation or contain unsupported recommendations.
* Automatically fall back to deterministic protocol guidance whenever validation fails or the model is unavailable.
* Log the protocol version, source, validation status, and response metadata for auditing and continuous quality improvement.

This architecture minimizes hallucinations, ensures consistent adherence to approved protocols, and provides a transparent decision trail suitable for safety-critical applications.


## Tests

```bash
node --test
```

If your environment has `npm`, `npm start` and `npm test` work too.
