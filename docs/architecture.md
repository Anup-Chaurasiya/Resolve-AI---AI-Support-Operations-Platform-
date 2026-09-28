# ResolveAI Architecture

ResolveAI has four main parts: a React workspace, a FastAPI edge, a LangGraph workflow, and a Qdrant knowledge store.

```text
Workspace → API edge → ResolveAI workflow → Groq or OpenAI
                              └→ Qdrant knowledge search
```

See [architecture diagrams](architecture-diagrams.md) for the visual flows.

## Request flow

1. The API validates request size, rate limits, credentials, and payloads.
2. ResolveAI searches factual knowledge and voice samples separately.
3. The model receives the conversation, relevant context, and writing style.
4. The API returns a complete answer or streams `sources`, `delta`, and `done` events.

Every response carries an `x-request-id`. Failures use one predictable problem-details shape and never expose internal exceptions.

## Components

| Area | Responsibility |
| --- | --- |
| `api/` | Routes, schemas, auth, middleware, and errors |
| `agent/` | Prompt, model selection, graph, memory, and streaming |
| `rag/` | File loading, chunking, embeddings, retrieval, and sources |
| `core/` | Environment settings and structured logging |
| `observability/` | OpenTelemetry setup and spans |
| `frontend/` | Chat, knowledge management, uploads, and source display |

## Knowledge model

ResolveAI stores factual documents and voice samples in the same Qdrant collection with different `document_type` values. They are retrieved independently so writing style cannot be mistaken for factual evidence.

Chunk IDs are derived from the source, type, and content hash. Uploading unchanged content therefore updates the same records instead of creating duplicates.

## Conversation state

The default in-memory checkpointer keeps history by `thread_id`. Requests for the same thread are serialized inside one API process; different threads can run concurrently.

For multiple replicas, replace in-memory state and rate limiting with shared services such as Postgres and Redis.

## Operations

- JSON logs include request context.
- Optional OTLP spans cover agent calls and knowledge operations.
- `/health/live` reports process health; `/health/ready` reports readiness.
- Local mode exposes OpenAPI docs; production mode hides them.
- Qdrant server mode is recommended for normal development and deployment.

## Important settings

| Setting | Purpose |
| --- | --- |
| `AI_AGENT_MODEL_PROVIDER` | Selects Groq or OpenAI |
| `AI_AGENT_AUTH_API_KEYS` | Enables API-key protection |
| `AI_AGENT_RATE_LIMIT_*` | Controls request throttling |
| `AI_AGENT_RAG_*` | Tunes knowledge ingestion and search |
| `AI_AGENT_AGENT_CHECKPOINT_BACKEND` | Selects memory or no checkpointing |
| `AI_AGENT_OTEL_*` | Enables tracing and sets the collector |

Keep model credentials outside the repository. In production, use TLS, a secrets manager, global rate limiting, and durable conversation storage.
