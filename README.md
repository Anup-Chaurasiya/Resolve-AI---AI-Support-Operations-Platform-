# ResolveAI

**Resolve faster. Answer with evidence.**

ResolveAI is an AI workspace for customer-support teams. It turns internal knowledge into clear, source-backed answers and helps operators draft replies in a consistent voice.

## What it does

- Streams grounded answers with visible sources.
- Searches policies, notes, Markdown, JSON, text, and PDF files.
- Learns tone from approved writing samples without copying them.
- Keeps conversations together with thread-based memory.
- Adds API-key auth, rate limits, request IDs, logs, and optional tracing.

## Run locally

You need Docker and a Groq or OpenAI API key.

```bash
cp .env.example .env
# Add GROQ_API_KEY or OPENAI_API_KEY to .env
docker compose up --build
```

Open `http://127.0.0.1:5173`. API documentation is available at `http://127.0.0.1:8000/docs` in local mode.

For development without Docker:

```bash
uv sync --all-extras --dev
uv run fastapi dev src/resolve_ai/main.py

cd frontend
npm install
npm run dev
```

## Choose a model

Groq is the default:

```env
GROQ_API_KEY=gsk_...
AI_AGENT_MODEL_PROVIDER=groq
AI_AGENT_MODEL_NAME=llama-3.1-8b-instant
```

To use OpenAI:

```env
OPENAI_API_KEY=sk_...
AI_AGENT_MODEL_PROVIDER=openai
AI_AGENT_MODEL_NAME=gpt-4o-mini
```

All backend settings use the stable `AI_AGENT_` prefix. See [.env.example](.env.example) for the complete list.

## Add knowledge

Use the Knowledge screen or send content directly to the API:

```bash
curl -X POST http://127.0.0.1:8000/v1/rag/documents \
  -H "Content-Type: application/json" \
  -d '{"source":"refund-policy","text":"Approved refunds settle within five to ten business days."}'
```

Then ask ResolveAI:

```bash
curl -X POST http://127.0.0.1:8000/v1/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"message":"How long will my refund take?","thread_id":"demo"}'
```

If API keys are configured with `AI_AGENT_AUTH_API_KEYS`, include `x-api-key` in each `/v1/*` request.

## Project map

```text
src/resolve_ai/   API, agent workflow, retrieval, settings, and tracing
frontend/         ResolveAI React workspace
tests/            API, service, retrieval, and evaluation checks
docs/             Architecture notes and diagrams
```

## Development

```bash
make check          # lint, type-check, and test
make eval-offline   # deterministic evaluation
make frontend-build
```

See [Architecture](docs/architecture.md) for implementation details.

## License

MIT
