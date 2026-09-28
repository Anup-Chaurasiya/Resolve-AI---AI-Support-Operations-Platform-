import pytest
from fastapi.testclient import TestClient

from resolve_ai.api.app import create_app
from resolve_ai.api.dependencies import get_app_settings
from resolve_ai.api.routes import health
from resolve_ai.core.settings import Settings


def test_health_endpoints() -> None:
    app = create_app()
    app.dependency_overrides[get_app_settings] = lambda: Settings(rag_enabled=False)
    client = TestClient(app)

    live = client.get("/health/live")
    ready = client.get("/health/ready")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok"}


def test_ready_initializes_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    app = create_app()
    settings = Settings(rag_enabled=True)
    app.dependency_overrides[get_app_settings] = lambda: settings
    calls: list[Settings] = []
    monkeypatch.setattr(health, "build_embeddings", calls.append)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert calls == [settings]


def test_ready_reports_embedding_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    app = create_app()
    app.dependency_overrides[get_app_settings] = lambda: Settings(rag_enabled=True)

    def fail(_: Settings) -> None:
        raise FileNotFoundError("model_optimized.onnx")

    monkeypatch.setattr(health, "build_embeddings", fail)

    response = TestClient(app).get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}
