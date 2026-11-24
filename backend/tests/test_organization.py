from uuid import uuid4

from sqlalchemy import select

from devhub.models import Application, MemoryItem

from .conftest import make_app, make_conversation


async def test_authentication_fails_closed(env):
    client, app, _ = env
    assert (
        await client.get("/api/v1/tree", headers={"Authorization": "Bearer wrong"})
    ).status_code == 401
    app.state.settings.devhub_access_token = ""
    assert (await client.get("/api/v1/tree")).status_code == 503


async def test_tree_nested_folder_rename_and_archive(env):
    client, _, _ = env
    app = await make_app(client)
    root = (
        await client.post("/api/v1/folders", json={"name": "Arquitetura", "app_id": app["app_id"]})
    ).json()
    child = (
        await client.post(
            "/api/v1/folders",
            json={"name": "ADRs", "app_id": app["app_id"], "parent_folder_id": root["folder_id"]},
        )
    ).json()
    conversation = await make_conversation(client, app["app_id"], child["folder_id"])
    tree = (await client.get("/api/v1/tree")).json()
    assert len(tree["applications"]) == 1 and len(tree["folders"]) == 2
    renamed = (
        await client.patch(f"/api/v1/applications/{app['app_id']}", json={"name": "Renomeado"})
    ).json()
    assert renamed["app_id"] == app["app_id"] and renamed["name"] == "Renomeado"
    assert (
        await client.patch(f"/api/v1/folders/{root['folder_id']}", json={"archived": True})
    ).status_code == 200
    assert (await client.get("/api/v1/tree")).json()["conversations"] == []
    archived = (await client.get("/api/v1/tree?archived=true")).json()
    assert next(
        c
        for c in archived["conversations"]
        if c["conversation_id"] == conversation["conversation_id"]
    )["archived"]
    assert (
        await client.patch(
            f"/api/v1/conversations/{conversation['conversation_id']}", json={"archived": False}
        )
    ).status_code == 409


async def test_cross_app_folder_and_cycles_rejected(env):
    client, _, _ = env
    a, b = await make_app(client, "A"), await make_app(client, "B")
    folder = (
        await client.post("/api/v1/folders", json={"name": "A-root", "app_id": a["app_id"]})
    ).json()
    response = await client.post(
        "/api/v1/conversations", json={"app_id": b["app_id"], "folder_id": folder["folder_id"]}
    )
    assert response.status_code == 422
    child = (
        await client.post(
            "/api/v1/folders",
            json={"name": "child", "app_id": a["app_id"], "parent_folder_id": folder["folder_id"]},
        )
    ).json()
    assert (
        await client.patch(
            f"/api/v1/folders/{folder['folder_id']}", json={"parent_folder_id": child["folder_id"]}
        )
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/v1/folders/{folder['folder_id']}", json={"parent_folder_id": folder["folder_id"]}
        )
    ).status_code == 422


async def test_ownership_checked_in_backend(env):
    client, app, _ = env
    async with app.state.sessions() as db:
        private = Application(owner_id="another-owner", name="Private", slug="private")
        db.add(private)
        await db.commit()
        identity = private.app_id
    assert (
        await client.patch(f"/api/v1/applications/{identity}", json={"name": "Leak"})
    ).status_code == 404
    assert (await client.get(f"/api/v1/memory?app_id={identity}")).status_code == 404
    assert (await client.get(f"/api/v1/search?q=Private&app_id={identity}")).status_code == 404
    assert (await client.get("/api/v1/tree")).json()["applications"] == []


async def test_move_requires_preview_and_preserves_selected_memories_only(env):
    client, app, _ = env
    project = await make_app(client)
    general = await make_conversation(client)
    async with app.state.sessions() as db:
        for text in ("Selecionada", "Privada não selecionada"):
            db.add(
                MemoryItem(
                    owner_id="personal-owner",
                    app_id=None,
                    conversation_id=general["conversation_id"],
                    content=text,
                    category="decision",
                    source_label="Teste de aprovação",
                )
            )
        await db.commit()
    path = f"/api/v1/conversations/{general['conversation_id']}"
    assert (
        await client.patch(path, json={"app_id": project["app_id"], "folder_id": None})
    ).status_code == 409
    preview = (await client.post(path + "/move-preview", json={"app_id": project["app_id"]})).json()
    selected = preview["candidates"][0]["memory_item_id"]
    response = await client.patch(
        path,
        json={
            "app_id": project["app_id"],
            "folder_id": None,
            "move_token": preview["move_token"],
            "approved_memory_ids": [selected],
        },
    )
    assert response.status_code == 200, response.text
    memories = (await client.get(f"/api/v1/memory?app_id={project['app_id']}")).json()
    assert len(memories) == 1 and memories[0]["source_memory_id"] == selected
    # Replay is not allowed to move it back using a stale preview.
    assert (
        await client.patch(
            path, json={"app_id": None, "folder_id": None, "move_token": preview["move_token"]}
        )
    ).status_code == 409
    async with app.state.sessions() as db:
        assert len(list(await db.scalars(select(MemoryItem)))) == 3


async def test_move_preview_invalidated_on_rename_or_wrong_candidate(env):
    client, _, _ = env
    app = await make_app(client)
    conv = await make_conversation(client)
    path = f"/api/v1/conversations/{conv['conversation_id']}"
    preview = (await client.post(path + "/move-preview", json={"app_id": app["app_id"]})).json()
    response = await client.patch(
        path,
        json={
            "app_id": app["app_id"],
            "move_token": preview["move_token"],
            "approved_memory_ids": [str(uuid4())],
        },
    )
    assert response.status_code == 422
    await client.patch(path, json={"title": "Alteração concorrente"})
    assert (
        await client.patch(
            path, json={"app_id": app["app_id"], "move_token": preview["move_token"]}
        )
    ).status_code == 409
    assert (
        await client.patch(path, json={"app_id": app["app_id"], "move_token": "tampered"})
    ).status_code == 409


async def test_search_scope_and_memory_deletion_audit(env):
    client, app, _ = env
    a, b = await make_app(client, "A"), await make_app(client, "B")
    await make_conversation(client, a["app_id"], title="Arquitetura alvo")
    await make_conversation(client, b["app_id"], title="Arquitetura privada")
    item = (
        await client.post(
            "/api/v1/memory", json={"app_id": a["app_id"], "content": "Arquitetura aprovada"}
        )
    ).json()
    response = (await client.get(f"/api/v1/search?q=Arquitetura&app_id={a['app_id']}")).json()
    assert len(response["conversations"]) == 1 and len(response["memory_items"]) == 1
    assert (await client.get("/api/v1/search?q=Arquitetura&app_id=general")).json()[
        "conversations"
    ] == []
    assert (await client.delete(f"/api/v1/memory/{item['memory_item_id']}")).status_code == 204
    assert (await client.get(f"/api/v1/memory?app_id={a['app_id']}")).json() == []
    assert (await client.get("/api/v1/search?q=%")).json()["conversations"] == []
    assert (
        await client.post("/api/v1/applications", json={"name": " ", "unexpected": True})
    ).status_code == 422
