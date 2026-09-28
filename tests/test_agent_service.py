import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from ai_agent_template.agent.service import AgentService
from ai_agent_template.api.schemas import AgentInvokeRequest
from ai_agent_template.rag.schemas import RagSource


class FakeGraph:
    async def ainvoke(
        self,
        input: dict[str, Any],  # noqa: A002 - match LangGraph/LangChain runnable API.
        config: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        assert input["messages"][0].content == "hello"
        assert config == {"configurable": {"thread_id": "thread-1"}}
        return {"messages": [*input["messages"], AIMessage(content="world")], "sources": []}

    async def astream(
        self,
        input: dict[str, Any],  # noqa: A002 - match LangGraph/LangChain runnable API.
        config: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        yield (
            "updates",
            {"retrieve": {"sources": [RagSource(source="kb", content="x")]}},
        )
        yield ("messages", (AIMessageChunk(content="hello "), {"langgraph_node": "agent"}))
        yield ("messages", (AIMessageChunk(content="world"), {"langgraph_node": "agent"}))


class ConcurrentGraph:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0

    async def ainvoke(
        self,
        input: dict[str, Any],  # noqa: A002 - match LangGraph/LangChain runnable API.
        config: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.02)
        self.active -= 1
        return {"messages": [*input["messages"], AIMessage(content="done")], "sources": []}


@pytest.mark.asyncio
async def test_agent_service_invokes_graph() -> None:
    service = AgentService(FakeGraph())

    response = await service.invoke(AgentInvokeRequest(message="hello", thread_id="thread-1"))

    assert response.message == "world"
    assert response.thread_id == "thread-1"
    assert response.sources == []


@pytest.mark.asyncio
async def test_agent_service_streams_deltas_and_sources() -> None:
    service = AgentService(FakeGraph())

    events = [event async for event in service.stream(AgentInvokeRequest(message="hi"))]

    types = [event["type"] for event in events]
    assert types[0] == "sources"
    assert events[0]["sources"][0]["source"] == "kb"
    assert "delta" in types
    assert types[-1] == "done"


@pytest.mark.asyncio
async def test_agent_service_serializes_requests_for_the_same_thread() -> None:
    graph = ConcurrentGraph()
    service = AgentService(graph)

    await asyncio.gather(
        service.invoke(AgentInvokeRequest(message="one", thread_id="shared")),
        service.invoke(AgentInvokeRequest(message="two", thread_id="shared")),
    )

    assert graph.max_active == 1


@pytest.mark.asyncio
async def test_agent_service_keeps_different_threads_concurrent() -> None:
    graph = ConcurrentGraph()
    service = AgentService(graph)

    await asyncio.gather(
        service.invoke(AgentInvokeRequest(message="one", thread_id="thread-a")),
        service.invoke(AgentInvokeRequest(message="two", thread_id="thread-b")),
    )

    assert graph.max_active == 2
