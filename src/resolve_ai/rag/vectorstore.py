import os
import shutil
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

import structlog
from fastembed import TextEmbedding
from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
from langchain_core.embeddings import Embeddings
from langchain_qdrant import QdrantVectorStore, RetrievalMode
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams

from resolve_ai.core.settings import Settings

logger = structlog.get_logger(__name__)

_embeddings_lock = Lock()
_embedding_instances: dict[tuple[str, str], Embeddings] = {}
_bundled_cache_dir = Path(__file__).resolve().parent / "_fastembed_cache"


def _fastembed_cache_dir(model_name: str) -> Path:
    if _model_cache_is_complete(_bundled_cache_dir, model_name):
        return _bundled_cache_dir

    default = Path(tempfile.gettempdir()) / "fastembed_cache"
    return Path(os.environ.get("FASTEMBED_CACHE_PATH", default))


def _model_cache_details(model_name: str) -> tuple[str, str] | None:
    """Return FastEmbed's Hugging Face repository and required ONNX file."""
    models: list[dict[str, Any]] = TextEmbedding.list_supported_models()
    for model in models:
        if str(model.get("model", "")).lower() != model_name.lower():
            continue

        sources = model.get("sources")
        model_file = model.get("model_file")
        if not isinstance(sources, dict) or not isinstance(model_file, str):
            return None

        hugging_face_repo = sources.get("hf")
        if isinstance(hugging_face_repo, str):
            return hugging_face_repo, model_file
        return None
    return None


def _model_cache_dir(cache_dir: Path, model_name: str) -> tuple[Path, str] | None:
    details = _model_cache_details(model_name)
    if details is None:
        return None

    hugging_face_repo, model_file = details
    model_cache_dir = cache_dir / f"models--{hugging_face_repo.replace('/', '--')}"
    return model_cache_dir, model_file


def _model_cache_is_complete(cache_dir: Path, model_name: str) -> bool:
    cache_details = _model_cache_dir(cache_dir, model_name)
    if cache_details is None:
        return False

    model_cache_dir, model_file = cache_details
    if not model_cache_dir.exists():
        return False

    snapshots_dir = model_cache_dir / "snapshots"
    snapshots = (
        [path for path in snapshots_dir.iterdir() if path.is_dir()]
        if snapshots_dir.is_dir()
        else []
    )
    return bool(snapshots) and all((snapshot / model_file).is_file() for snapshot in snapshots)


def _remove_incomplete_model_cache(cache_dir: Path, model_name: str) -> bool:
    """Remove only this model's cache when one of its snapshots is incomplete."""
    cache_details = _model_cache_dir(cache_dir, model_name)
    if cache_details is None:
        return False

    model_cache_dir, _ = cache_details
    if not model_cache_dir.exists() or _model_cache_is_complete(cache_dir, model_name):
        return False

    shutil.rmtree(model_cache_dir)
    logger.warning(
        "removed_incomplete_fastembed_cache",
        model_name=model_name,
        cache_path=str(model_cache_dir),
    )
    return True


def build_embeddings(settings: Settings) -> Embeddings:
    """Build FastEmbed once per process and repair a partial first download once."""
    cache_dir = _fastembed_cache_dir(settings.rag_embedding_model_name)
    cache_key = (settings.rag_embedding_model_name, str(cache_dir))

    cached = _embedding_instances.get(cache_key)
    if cached is not None:
        return cached

    # functools.lru_cache can invoke a function more than once while the first call is
    # still running. Keep the whole FastEmbed download/load sequence behind one lock.
    with _embeddings_lock:
        cached = _embedding_instances.get(cache_key)
        if cached is not None:
            return cached

        for attempt in range(2):
            try:
                embeddings = FastEmbedEmbeddings(
                    model_name=settings.rag_embedding_model_name,
                    cache_dir=str(cache_dir),
                )
            except Exception:
                should_retry = attempt == 0 and _remove_incomplete_model_cache(
                    cache_dir,
                    settings.rag_embedding_model_name,
                )
                if not should_retry:
                    raise
                logger.warning(
                    "retrying_fastembed_initialization",
                    model_name=settings.rag_embedding_model_name,
                )
            else:
                _embedding_instances[cache_key] = embeddings
                return embeddings

    raise RuntimeError("FastEmbed initialization failed without raising an exception.")


def build_qdrant_client(settings: Settings) -> QdrantClient:
    if settings.qdrant_url:
        return QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key.get_secret_value() if settings.qdrant_api_key else None,
        )
    return QdrantClient(path=settings.qdrant_storage_path)


def ensure_collection(client: QdrantClient, settings: Settings) -> None:
    if client.collection_exists(settings.rag_collection_name):
        return

    client.create_collection(
        collection_name=settings.rag_collection_name,
        vectors_config=VectorParams(
            size=settings.rag_embedding_dimensions,
            distance=Distance.COSINE,
        ),
    )


def build_vector_store(settings: Settings) -> QdrantVectorStore:
    client = build_qdrant_client(settings)
    ensure_collection(client, settings)
    return QdrantVectorStore(
        client=client,
        collection_name=settings.rag_collection_name,
        embedding=build_embeddings(settings),
        retrieval_mode=RetrievalMode.DENSE,
    )
