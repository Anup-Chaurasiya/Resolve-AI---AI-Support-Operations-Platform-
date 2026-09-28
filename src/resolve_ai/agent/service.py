import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from threading import Lock
from typing import Any, cast

from langchain_core.messages import AIMessage, AIMessageChunk

from resolve_ai.agent.graph import initial_state
from resolve_ai.api.schemas import AgentInvokeRequest, AgentInvokeResponse
from resolve_ai.observability.tracing import agent_span
from resolve_ai.rag.schemas import RagSource

# `Any` because LangGraph's CompiledStateGraph has overloaded `astream` signatures
# that no narrow Protocol can match. The service treats it as a runnable with
# `ainvoke` and `astream` — those are validated structurally at call time.
AgentGraph = Any


class AgentService:
    def __init__(self, graph: AgentGraph) -> None:
        self._graph = graph
        self._thread_locks: dict[str, _ThreadLock] = {}
        self._thread_locks_guard = Lock()

    async def invoke(self, request: AgentInvokeRequest) -> AgentInvokeResponse:
        async with self._serialize_thread(request.thread_id):
            config = self._config(request.thread_id)
            with agent_span("agent.invoke", thread_id=request.thread_id):
                result = cast(
                    dict[str, Any],
                    await self._graph.ainvoke(initial_state(request.message), config=config),
                )
            messages = result.get("messages", [])
            sources = [
                source for source in result.get("sources", []) if isinstance(source, RagSource)
            ]
            final_message = messages[-1] if messages else AIMessage(content="")
            return AgentInvokeResponse(
                message=str(final_message.content),
                thread_id=request.thread_id,
                sources=sources,
            )

    async def stream(self, request: AgentInvokeRequest) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE-friendly events: token deltas, sources, and a final done event."""
        async with self._serialize_thread(request.thread_id):
            config = self._config(request.thread_id)
            sources_emitted = False
            with agent_span("agent.stream", thread_id=request.thread_id):
                async for mode, chunk in self._graph.astream(
                    initial_state(request.message),
                    config=config,
                    stream_mode=["updates", "messages"],
                ):
                    if mode == "updates":
                        sources = _extract_sources(chunk)
                        if sources and not sources_emitted:
                            sources_emitted = True
                            yield {
                                "type": "sources",
                                "sources": [s.model_dump() for s in sources],
                            }
                    elif mode == "messages":
                        message_chunk, metadata = chunk
                        if isinstance(message_chunk, AIMessageChunk):
                            text = str(message_chunk.content)
                            if text:
                                yield {
                                    "type": "delta",
                                    "text": text,
                                    "node": metadata.get("langgraph_node") if metadata else None,
                                }
            yield {"type": "done", "thread_id": request.thread_id}

    @asynccontextmanager
    async def _serialize_thread(self, thread_id: str | None) -> AsyncIterator[None]:
        if thread_id is None:
            yield
            return

        with self._thread_locks_guard:
            entry = self._thread_locks.setdefault(thread_id, _ThreadLock(asyncio.Lock()))
            entry.users += 1

        acquired = False
        try:
            await entry.lock.acquire()
            acquired = True
            yield
        finally:
            if acquired:
                entry.lock.release()
            with self._thread_locks_guard:
                entry.users -= 1
                if entry.users == 0:
                    self._thread_locks.pop(thread_id, None)

    @staticmethod
    def _config(thread_id: str | None) -> dict[str, Any] | None:
        if not thread_id:
            return None
        return {"configurable": {"thread_id": thread_id}}


def _extract_sources(update: dict[str, Any]) -> list[RagSource]:
    if not isinstance(update, dict):
        return []
    for node_state in update.values():
        if not isinstance(node_state, dict):
            continue
        candidates = node_state.get("sources", [])
        if candidates:
            return [s for s in candidates if isinstance(s, RagSource)]
    return []


@dataclass
class _ThreadLock:
    lock: asyncio.Lock
    users: int = 0
