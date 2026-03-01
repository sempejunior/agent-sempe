"""Dual-mode RAG retriever store (filesystem or database)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from nanobot.utils.helpers import ensure_dir

if TYPE_CHECKING:
    from nanobot.db.repositories import RetrieverRepository


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into chunks by paragraphs with overlap."""
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 > chunk_size and current:
            chunks.append(current.strip())
            tail = current[-overlap:] if overlap and len(current) > overlap else ""
            current = tail + "\n\n" + para if tail else para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text.strip()] if text.strip() else []


class HttpRetriever:
    """Generic HTTP client for external RAG backends."""

    def __init__(
        self,
        api_url: str,
        *,
        api_key: str = "",
        headers: dict[str, str] | None = None,
        search_path: str = "/search",
        ingest_path: str = "/ingest",
        delete_path: str = "/delete",
        timeout: int = 30,
    ):
        self._api_url = api_url.rstrip("/")
        self._api_key = api_key
        self._headers = headers or {}
        self._search_path = search_path
        self._ingest_path = ingest_path
        self._delete_path = delete_path
        self._timeout = timeout

    def _build_headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json", **self._headers}
        if self._api_key:
            h["Authorization"] = f"Bearer {self._api_key}"
        return h

    async def ingest(self, user_id: str, content: str, metadata: dict[str, Any] | None = None) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._api_url}{self._ingest_path}",
                headers=self._build_headers(),
                json={"content": content, "metadata": metadata or {}, "user_id": user_id},
            )
            resp.raise_for_status()
            return resp.json().get("id", "ok")

    async def search(self, user_id: str, query: str, *, top_k: int = 5) -> list[dict[str, Any]]:
        import httpx
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._api_url}{self._search_path}",
                headers=self._build_headers(),
                json={"query": query, "top_k": top_k, "user_id": user_id},
            )
            resp.raise_for_status()
            return resp.json().get("results", [])

    async def delete(self, user_id: str, chunk_id: str) -> bool:
        import httpx
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.request(
                "DELETE",
                f"{self._api_url}{self._delete_path}",
                headers=self._build_headers(),
                json={"chunk_id": chunk_id, "user_id": user_id},
            )
            return resp.status_code < 400

    async def list_sources(self, user_id: str) -> list[dict[str, Any]]:
        return []


class RetrieverStore:
    """RAG chunk storage with search.

    Supports two modes:
    - Filesystem: append-only JSONL at workspace/rag/chunks.jsonl, substring search.
    - DB mode: delegates to RetrieverRepository (SQLite FTS5 or HTTP).
    """

    def __init__(
        self,
        workspace: Path | None = None,
        *,
        retriever_repo: RetrieverRepository | None = None,
        user_id: str | None = None,
    ):
        if retriever_repo is not None:
            self._mode = "db"
            self._repo = retriever_repo
            self._user_id = user_id or ""
        elif workspace is not None:
            self._mode = "fs"
            self._rag_dir = ensure_dir(workspace / "rag")
            self._chunks_file = self._rag_dir / "chunks.jsonl"
        else:
            raise ValueError("Either workspace or retriever_repo must be provided")

    async def ingest(self, content: str, metadata: dict[str, Any] | None = None) -> str:
        if self._mode == "db":
            return await self._repo.ingest(self._user_id, content, metadata)

        entry = {"content": content, "metadata": metadata or {}}
        line = json.dumps(entry, ensure_ascii=False) + "\n"
        await asyncio.to_thread(self._append_line, line)
        return "ok"

    async def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        if self._mode == "db":
            return await self._repo.search(self._user_id, query, top_k=top_k)

        return await asyncio.to_thread(self._search_fs, query, top_k)

    async def delete(self, chunk_id: str) -> bool:
        if self._mode == "db":
            return await self._repo.delete(self._user_id, chunk_id)
        return False

    async def list_sources(self) -> list[dict[str, Any]]:
        if self._mode == "db":
            return await self._repo.list_sources(self._user_id)

        return await asyncio.to_thread(self._list_sources_fs)

    def _append_line(self, line: str) -> None:
        with open(self._chunks_file, "a", encoding="utf-8") as f:
            f.write(line)

    def _read_lines(self) -> list[str]:
        if not self._chunks_file.exists():
            return []
        return self._chunks_file.read_text(encoding="utf-8").splitlines()

    def _search_fs(self, query: str, top_k: int) -> list[dict[str, Any]]:
        query_lower = query.lower()
        matches: list[dict[str, Any]] = []
        for line in self._read_lines():
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if query_lower in entry.get("content", "").lower():
                matches.append(entry)
            if len(matches) >= top_k:
                break
        return matches

    def _list_sources_fs(self) -> list[dict[str, Any]]:
        sources: dict[str, int] = {}
        for line in self._read_lines():
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                source = entry.get("metadata", {}).get("source", "unknown")
                sources[source] = sources.get(source, 0) + 1
            except json.JSONDecodeError:
                continue
        return [{"source": s, "chunk_count": c} for s, c in sources.items()]
