#!/usr/bin/env python3
"""Falha quando fontes/configs novos não têm responsabilidade registrada no mapa."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".ruff_cache", "dist", "out", "artifacts", "coverage", "test-results", "playwright-report"}
SKIP_FILES = {"CODEBASE_MAP.md"}


def intended_files():
    files = []
    for directory, dirs, names in os.walk(ROOT):
        dirs[:] = [name for name in dirs if name not in SKIP_DIRS]
        for name in names:
            path = Path(directory) / name
            if name in SKIP_FILES or path.suffix in {".vsix", ".zip", ".pyc"}:
                continue
            if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
                continue
            files.append(path.relative_to(ROOT).as_posix())
    return sorted(files)


def main():
    file = ROOT / "CODEBASE_MAP.md"
    if not file.is_file():
        raise SystemExit("CODEBASE_MAP.md ausente.")
    content = file.read_text()
    missing = [path for path in intended_files() if f"`{path}`" not in content]
    if missing:
        raise SystemExit("Mapa incompleto:\n" + "\n".join(missing))
    print(f"CODEBASE_MAP conferido: {len(intended_files())} arquivos com responsabilidade registrada.")


if __name__ == "__main__":
    main()
