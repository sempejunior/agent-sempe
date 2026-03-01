# RAG Knowledge Base

## When to use
- Search the knowledge base (`rag_search`) before answering questions that might
  require previously ingested reference material.
- Use as a complement to memory: memory stores short facts, RAG stores full documents.

## When to ingest
- When the user shares reference documents or URLs they want searchable later.
- After fetching web pages with `web_fetch` that contain important reference material.

## Behavior
- Always cite the source when using RAG results.
- If RAG returns no results, fall back to memory search or ask the user.
