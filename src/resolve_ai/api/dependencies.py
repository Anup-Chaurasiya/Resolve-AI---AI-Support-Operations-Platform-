from functools import lru_cache

from resolve_ai.agent.checkpointer import build_checkpointer
from resolve_ai.agent.graph import build_agent_graph
from resolve_ai.agent.models import build_chat_model
from resolve_ai.agent.service import AgentService
from resolve_ai.core.settings import Settings, get_settings
from resolve_ai.rag.service import EmptyRagRetriever, RagService
from resolve_ai.rag.vectorstore import build_vector_store


@lru_cache(maxsize=1)
def get_agent_service() -> AgentService:
    settings = get_settings()
    model = build_chat_model(settings)
    retriever = get_rag_service() if settings.rag_enabled else EmptyRagRetriever()
    checkpointer = build_checkpointer(settings)
    graph = build_agent_graph(model, retriever=retriever, checkpointer=checkpointer)
    return AgentService(graph=graph)


@lru_cache(maxsize=1)
def get_rag_service() -> RagService:
    settings = get_settings()
    vector_store = build_vector_store(settings)
    return RagService(settings=settings, vector_store=vector_store)


def get_app_settings() -> Settings:
    return get_settings()
