from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Response

from resolve_ai.api.dependencies import get_app_settings
from resolve_ai.api.schemas import HealthResponse
from resolve_ai.core.settings import Settings
from resolve_ai.rag.vectorstore import build_embeddings

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.get("/", response_model=HealthResponse, include_in_schema=False)
async def root() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse)
def ready(
    response: Response,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> HealthResponse:
    if not settings.rag_enabled:
        return HealthResponse(status="ok")

    try:
        build_embeddings(settings)
    except Exception:
        logger.exception("embedding_readiness_check_failed")
        response.status_code = 503
        return HealthResponse(status="not_ready")

    return HealthResponse(status="ok")
