"""RAG tools: search and ingest documents into the knowledge base."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from nanobot.agent.tools.base import Tool

if TYPE_CHECKING:
    from nanobot.agent.retriever import RetrieverStore


class RAGSearchTool(Tool):
    """Search the knowledge base for relevant document chunks."""

    def __init__(self, retriever: RetrieverStore):
        self._retriever = retriever

    @property
    def name(self) -> str:
        return "rag_search"

    @property
    def description(self) -> str:
        return (
            "Search the RAG knowledge base for documents relevant to a query. "
            "Returns matching chunks with source metadata. Use this before answering "
            "questions that might require previously ingested reference material."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (natural language or keywords).",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Max number of results (default 5).",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 20,
                },
            },
            "required": ["query"],
        }

    async def execute(self, **kwargs: Any) -> str:
        query = kwargs.get("query", "").strip()
        if not query:
            return "Error: 'query' is required."
        top_k = min(max(int(kwargs.get("top_k", 5)), 1), 20)

        try:
            results = await self._retriever.search(query, top_k=top_k)
            if not results:
                return f"No documents found matching '{query}'."

            parts = []
            for i, r in enumerate(results, 1):
                content = r.get("content", "")
                meta = r.get("metadata", {})
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except json.JSONDecodeError:
                        meta = {}
                source = meta.get("source", "unknown")
                idx = meta.get("chunk_index", "")
                header = f"[{source}]" + (f" chunk {idx}" if idx != "" else "")
                parts.append(f"**{i}. {header}**\n{content}")
            return "\n\n---\n\n".join(parts)
        except Exception as e:
            return f"Error searching RAG: {e}"


class RAGIngestTool(Tool):
    """Ingest content into the RAG knowledge base."""

    def __init__(self, retriever: RetrieverStore):
        self._retriever = retriever

    @property
    def name(self) -> str:
        return "rag_ingest"

    @property
    def description(self) -> str:
        return (
            "Ingest text content into the RAG knowledge base. The content is split into "
            "chunks and indexed for later retrieval via rag_search. Use this when the user "
            "shares reference documents or when you fetch important web pages."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The text content to ingest (markdown or plain text).",
                },
                "source": {
                    "type": "string",
                    "description": "Source label (URL, filename, or description).",
                },
            },
            "required": ["content", "source"],
        }

    async def execute(self, **kwargs: Any) -> str:
        from nanobot.agent.retriever import chunk_text

        content = kwargs.get("content", "").strip()
        source = kwargs.get("source", "").strip()
        if not content:
            return "Error: 'content' is required."
        if not source:
            return "Error: 'source' is required."

        try:
            chunks = chunk_text(content)
            ids = []
            for i, chunk in enumerate(chunks):
                chunk_id = await self._retriever.ingest(
                    chunk,
                    metadata={"source": source, "chunk_index": i},
                )
                ids.append(chunk_id)
            return f"Ingested '{source}': {len(chunks)} chunk(s), {len(content)} chars total."
        except Exception as e:
            return f"Error ingesting content: {e}"
