from typing import TypedDict

from langchain_core.messages import BaseMessage

from resolve_ai.rag.schemas import RagSource


class AgentState(TypedDict):
    messages: list[BaseMessage]
    sources: list[RagSource]
    voice_samples: list[RagSource]
