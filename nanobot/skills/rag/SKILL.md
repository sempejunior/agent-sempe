# RAG Knowledge Base

Tools: `rag_search`, `rag_ingest`

## Ingest Workflows

### From a URL
1. Fetch the page with `web_fetch`
2. Ingest the content: `rag_ingest(content=<fetched text>, source="https://example.com/doc")`

### From a file
1. Read the file with `read_file`
2. Ingest: `rag_ingest(content=<file content>, source="path/to/file.md")`

### From page-mapper results
After mapping pages with the page-mapper skill, ingest each page:
```
rag_ingest(content=<page content>, source="site.com/page-1")
```

## Search

Use `rag_search(query="your question")` to find relevant chunks.
Results include source metadata and chunk index for traceability.

Adjust `top_k` (1-20) based on how much context you need.

## Tips

- Ingest large documents early so they are available for later questions.
- Content is automatically split into chunks (~1000 chars with overlap).
- Always cite the source when using RAG results in your answers.
- Combine with `search_memory` for comprehensive recall: memory stores short facts, RAG stores full documents.
