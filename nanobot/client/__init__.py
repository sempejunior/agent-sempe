"""Client layer — per-end-user identity, memory, and session isolation.

This module layers business rules on top of the core nanobot agent engine
without modifying any core files.  It provides:

- **ClientAwareAgentLoop**: subclass of AgentLoop that resolves clients,
  scopes sessions per client, and swaps memory stores so each client
  gets isolated context.
- **ClientScopedMemory**: a MemoryStore-compatible wrapper that routes
  reads/writes to per-client storage while keeping the creator's memory
  visible in the system prompt.
- **resolve_client**: resolves an InboundMessage to a client_id by
  looking up (or creating) client identities.
"""
