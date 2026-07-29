# Grounded First Aid

A small, complete Node.js app that demonstrates a request-time protocol library for first-aid guidance.

The model is not treated as the medical authority. The server classifies the scenario, loads a source-backed protocol JSON file, sends that protocol with the user's message to Gemini, validates the structured model output, and falls back to deterministic protocol rendering when Gemini is unavailable or the output is invalid.

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

## Production Notes

The included protocol files are examples built from authoritative public guidance and should be reviewed by a qualified clinical reviewer before production use. Add exact page, section, publication date, reviewer, and localization metadata to each protocol as your library grows.

Keep model output constrained:

- classify only to known `scenario_id` values
- send only the selected protocol as context
- request JSON output with cited `used_step_ids`
- reject invalid or uncited output
- log protocol version/source with every answer

## Tests

```bash
node --test
```

If your environment has `npm`, `npm start` and `npm test` work too.
