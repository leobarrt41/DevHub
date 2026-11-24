#!/usr/bin/env python3
"""Validação opt-in contra servidor real. Somente modelo com preço zero no catálogo."""
import argparse
import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--report", default="artifacts/live-smoke.json")
    args = parser.parse_args()
    token = os.environ.get("DEVHUB_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("DEVHUB_ACCESS_TOKEN ausente; não enviar credencial pelo CLI.")
    async with httpx.AsyncClient(base_url=args.url, headers={"Authorization": f"Bearer {token}"}, timeout=260) as api:
        session = await api.get("/api/v1/session")
        session.raise_for_status()
        catalog = await api.get("/api/v1/models")
        catalog.raise_for_status()
        model = next(m for m in catalog.json()["models"] if m["id"] == "openrouter/free")
        if any(float(model.get("pricing", {}).get(field, "-1")) != 0 for field in ("prompt", "completion")):
            raise RuntimeError("Modelo deixou de ser gratuito; teste real não autorizado a gerar cobrança.")
        result = await api.post("/api/v1/applications", json={"name": "Validação real do MVP 1"})
        result.raise_for_status()
        app_id = result.json()["app_id"]
        result = await api.post("/api/v1/folders", json={"name": "Evidências de integração", "app_id": app_id})
        result.raise_for_status()
        folder_id = result.json()["folder_id"]
        result = await api.post("/api/v1/conversations", json={"title": "Streaming OpenRouter real", "app_id": app_id, "folder_id": folder_id})
        result.raise_for_status()
        conversation_id = result.json()["conversation_id"]
        request_id = str(uuid4())
        request = {"content": "Responda em uma única frase curta, em português: o cérebro do DevHub é online e o contexto fica em PostgreSQL? Não alegue executar ferramentas.", "model": model["id"], "request_id": request_id}
        response = await api.post(f"/api/v1/conversations/{conversation_id}/messages/stream", json=request)
        response.raise_for_status()
        events = []
        for frame in response.text.split("\n\n"):
            kind, data = "message", []
            for line in frame.splitlines():
                if line.startswith("event:"):
                    kind = line[6:].strip()
                elif line.startswith("data:"):
                    data.append(line[5:].strip())
            if data:
                events.append((kind, json.loads("\n".join(data))))
        if not events or events[-1][0] != "done":
            # Report safe code/message, never upstream payload or auth headers.
            raise RuntimeError(f"Streaming real não concluído: {events[-1] if events else 'sem eventos'}")
        task_id = events[0][1]["task_id"]
        history = await api.get(f"/api/v1/conversations/{conversation_id}/messages")
        history.raise_for_status()
        assert len(history.json()) == 2 and history.json()[1]["status"] == "completed"
        duplicate = await api.post(f"/api/v1/conversations/{conversation_id}/messages/stream", json=request)
        assert duplicate.status_code == 409
        detail = await api.get(f"/api/v1/tasks/{task_id}")
        detail.raise_for_status()
        assert detail.json()["task"]["generation_id"]
        # Cliente HTTP independente reproduz o canal técnico VS Code, sem segunda IA.
        async with httpx.AsyncClient(base_url=args.url, headers=api.headers) as second_interface:
            shared = await second_interface.get(f"/api/v1/conversations/{conversation_id}/messages")
            shared.raise_for_status()
            assert shared.json() == history.json()
        report = {"validated_at": datetime.now(UTC).isoformat(), "transport": "HTTP real FastAPI → LangGraph → OpenRouter → PostgreSQL", "app_id": app_id, "folder_id": folder_id, "conversation_id": conversation_id, "task_id": task_id, "generation_id": detail.json()["task"]["generation_id"], "model_id": model["id"], "events": [kind for kind, _ in events], "usage": events[-1][1]["usage"], "duration_ms": events[-1][1]["duration_ms"], "same_conversation_from_independent_client": True, "duplicate_request_status": duplicate.status_code, "vscode_host_ui_validated": False}
        destination = Path(args.report)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
