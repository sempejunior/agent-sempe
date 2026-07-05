"""System integrations catalog and per-user activation."""

from nanobot.integrations.catalog import (
    CATALOG,
    APIEndpoint,
    APIIntegration,
    AuthSpec,
    CredentialField,
    IntegrationEntry,
    MCPIntegration,
    get_integration,
)

__all__ = [
    "CATALOG",
    "APIEndpoint",
    "APIIntegration",
    "AuthSpec",
    "CredentialField",
    "IntegrationEntry",
    "MCPIntegration",
    "get_integration",
]
