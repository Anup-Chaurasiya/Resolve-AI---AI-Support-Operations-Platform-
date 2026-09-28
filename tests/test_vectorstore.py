import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest

from resolve_ai.core.settings import Settings
from resolve_ai.rag import vectorstore


@pytest.fixture(autouse=True)
def clear_embedding_instances(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vectorstore, "_embedding_instances", {})


def test_build_embeddings_serializes_and_caches_initialization(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls = 0
    instance = object()

    def build(**kwargs: Any) -> object:
        nonlocal calls
        calls += 1
        time.sleep(0.02)
        return instance

    monkeypatch.setattr(vectorstore, "FastEmbedEmbeddings", build)
    monkeypatch.setattr(vectorstore, "_fastembed_cache_dir", lambda _: tmp_path)
    settings = Settings()

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: vectorstore.build_embeddings(settings), range(8)))

    assert calls == 1
    assert all(result is instance for result in results)


def test_build_embeddings_removes_incomplete_snapshot_and_retries_once(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    model_cache = tmp_path / "models--qdrant--bge-small-en-v1.5-onnx-q"
    incomplete_snapshot = model_cache / "snapshots" / "revision"
    incomplete_snapshot.mkdir(parents=True)
    (incomplete_snapshot / "config.json").write_text("{}")

    calls = 0
    instance = object()

    def build(**kwargs: Any) -> object:
        nonlocal calls
        calls += 1
        assert kwargs["cache_dir"] == str(tmp_path)
        if calls == 1:
            raise FileNotFoundError(incomplete_snapshot / "model_optimized.onnx")
        return instance

    monkeypatch.setattr(vectorstore, "FastEmbedEmbeddings", build)
    monkeypatch.setattr(vectorstore, "_fastembed_cache_dir", lambda _: tmp_path)

    result = vectorstore.build_embeddings(Settings())

    assert result is instance
    assert calls == 2
    assert not model_cache.exists()
    assert vectorstore.build_embeddings(Settings()) is instance
    assert calls == 2


def test_build_embeddings_does_not_retry_unrelated_initialization_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls = 0

    def build(**kwargs: Any) -> object:
        nonlocal calls
        calls += 1
        raise RuntimeError("unsupported execution provider")

    monkeypatch.setattr(vectorstore, "FastEmbedEmbeddings", build)
    monkeypatch.setattr(vectorstore, "_fastembed_cache_dir", lambda _: tmp_path)

    with pytest.raises(RuntimeError, match="unsupported execution provider"):
        vectorstore.build_embeddings(Settings())

    assert calls == 1


def test_fastembed_cache_dir_prefers_complete_bundled_model(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    bundled_cache = tmp_path / "bundled"
    snapshot = (
        bundled_cache
        / "models--qdrant--bge-small-en-v1.5-onnx-q"
        / "snapshots"
        / "revision"
    )
    snapshot.mkdir(parents=True)
    (snapshot / "model_optimized.onnx").write_bytes(b"model")
    monkeypatch.setattr(vectorstore, "_bundled_cache_dir", bundled_cache)

    assert vectorstore._fastembed_cache_dir("BAAI/bge-small-en-v1.5") == bundled_cache
