"""Base prompt templates for nanobot agents.

These files define the core behavior of the agent. They are read-only and
shipped with the package. Users extend them via per-user prompt extensions
stored in the database.
"""

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent

PROMPT_FILES = {
    "SOUL.md": {
        "label": "Soul",
        "description": "Personality, tone, and core values.",
        "hint": "Add your persona here: who the agent is, how it should talk, "
                "its attitude and communication style.",
    },
    "AGENTS.md": {
        "label": "Behavior",
        "description": "Task execution rules and work style.",
        "hint": "Define business rules, domain expertise, task priorities, "
                "and how the agent should approach problems.",
    },
    "USER.md": {
        "label": "User Context",
        "description": "Information about the user and their environment.",
        "hint": "Tell the agent about yourself: your name, role, company, "
                "projects, preferences, and anything relevant.",
    },
    "RAG.md": {
        "label": "RAG",
        "description": "Knowledge base behavior: when to search, ingest, and cite.",
        "hint": "Customize when the agent should use the knowledge base. "
                "Examples: use as fallback only, always search before answering, "
                "never ingest without asking, etc.",
    },
    "QUESTIONS.md": {
        "label": "Pendências",
        "description": "Quando parar e perguntar a uma pessoa em vez de decidir.",
        "hint": "Ajuste o que este agente pode decidir sozinho e o que precisa "
                "sempre de confirmação de alguém. Exemplos: nunca decidir regra "
                "de negócio, sempre perguntar antes de mexer em dado de cliente, "
                "quem é a pessoa certa para cada tipo de dúvida.",
    },
}

PROMPT_ORDER = ["SOUL.md", "AGENTS.md", "USER.md", "RAG.md", "QUESTIONS.md"]


def load_base_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return ""
