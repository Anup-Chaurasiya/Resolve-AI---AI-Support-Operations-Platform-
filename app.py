"""Vercel entry point for the existing ResolveAI FastAPI application."""

from __future__ import annotations

import sys
from pathlib import Path

SOURCE_DIRECTORY = Path(__file__).resolve().parent / "src"
if str(SOURCE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SOURCE_DIRECTORY))

from resolve_ai.main import app  # noqa: E402

__all__ = ("app",)
