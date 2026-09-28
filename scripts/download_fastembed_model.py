"""Download the FastEmbed model once while Vercel builds the function bundle."""

from pathlib import Path

from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"
CACHE_DIR = Path(__file__).resolve().parents[1] / "src/resolve_ai/rag/_fastembed_cache"


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    TextEmbedding(model_name=MODEL_NAME, cache_dir=str(CACHE_DIR))
    print(f"Bundled FastEmbed model {MODEL_NAME} in {CACHE_DIR}")


if __name__ == "__main__":
    main()
