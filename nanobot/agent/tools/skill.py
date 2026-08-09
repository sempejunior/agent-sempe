"""Tools for managing agent skills."""

from __future__ import annotations

import difflib
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool


class SaveSkillTool(Tool):
    """
    Tool to save a learned skill as markdown documentation.

    This writes a Markdown file with YAML frontmatter containing 'name'
    and 'description', followed by the instructional content.
    """

    def __init__(
        self,
        *,
        workspace: Path | None = None,
        skill_repo: Any | None = None,
        user_id: str | None = None,
    ):
        self.workspace = workspace
        self.skill_repo = skill_repo
        self.user_id = user_id
        if not workspace and not (skill_repo and user_id):
            raise ValueError("Must provide either workspace or (skill_repo + user_id)")

    @property
    def name(self) -> str:
        return "save_skill"

    @property
    def description(self) -> str:
        return (
            "Save or update a procedural skill. Use this when the user instructs you "
            "to 'learn' or 'remember' a workflow, or when you write tools/scripts you want to keep. "
            "The content MUST be markdown with a YAML frontmatter block containing 'name' and 'description'."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "Short, hyphen-separated name (e.g., 'deploy-app').",
                    "maxLength": 64,
                },
                "skill_description": {
                    "type": "string",
                    "description": "Brief explanation of when to trigger this skill.",
                    "maxLength": 255,
                },
                "skill_content": {
                    "type": "string",
                    "description": "The full Markdown content including the procedural instructions. Do NOT include the YAML frontmatter in this string, it will be added automatically.",
                },
            },
            "required": ["skill_name", "skill_description", "skill_content"],
        }

    async def execute(self, **kwargs: Any) -> str:
        name = kwargs.get("skill_name", "").strip().lower()
        desc = kwargs.get("skill_description", "").strip()
        content = kwargs.get("skill_content", "").strip()

        if not name or not desc or not content:
            return "Error: skill_name, skill_description, and skill_content are required."

        full_markdown = f"---\nname: {name}\ndescription: {desc}\n---\n\n{content}"

        if self.skill_repo and self.user_id:
            previous = await self.skill_repo.get_skill(self.user_id, name)
            await self.skill_repo.save_skill(
                self.user_id,
                {
                    "name": name,
                    "description": desc,
                    "content": full_markdown,
                    "always_active": bool((previous or {}).get("always_active")),
                    "enabled": bool((previous or {}).get("enabled", True)),
                },
            )
            return self._saved_message(name, previous)
        elif self.workspace:
            skill_dir = self.workspace / "skills" / name
            skill_dir.mkdir(parents=True, exist_ok=True)
            skill_file = skill_dir / "SKILL.md"
            skill_file.write_text(full_markdown, encoding="utf-8")
            return f"Skill '{name}' successfully saved to filesystem at {skill_file}."

        return "Error: No storage configured for skills."

    @staticmethod
    def _saved_message(name: str, previous: dict[str, Any] | None) -> str:
        """Report creation and overwrite differently, and never imply the skill is in use.

        The upsert is destructive and there is no version history, so an update
        has to be visible in the answer. Saving also does not touch any agent's
        ``skills_enabled``: an agent with a closed list will not see the skill
        until someone enables it.
        """
        if previous:
            return (
                f"Skill '{name}' atualizada: o conteúdo anterior "
                f"({len(previous.get('content') or '')} chars) foi substituído. "
                "Diga ao usuário o que mudou."
            )
        return (
            f"Skill '{name}' criada. Ela ainda não está habilitada em nenhum agente: "
            "diga ao usuário que ele precisa habilitá-la no agente que vai usá-la "
            "(catálogo de Skills, ou a aba Skills do agente)."
        )


class ReadSkillTool(Tool):
    """Load a skill's full markdown content on demand."""

    def __init__(
        self,
        *,
        skill_repo: Any | None = None,
        user_id: str | None = None,
        workspace: Path | None = None,
        builtin_dir: Path | None = None,
    ):
        self.skill_repo = skill_repo
        self.user_id = user_id
        self.workspace = workspace
        self.builtin_dir = builtin_dir
        if not (skill_repo and user_id) and not workspace:
            raise ValueError("Must provide either (skill_repo + user_id) or workspace")

    @property
    def name(self) -> str:
        return "read_skill"

    @property
    def description(self) -> str:
        return (
            "Load the full instructions for a skill by name. Call this when you decide "
            "to use one of the skills listed in the system prompt. Returns the markdown "
            "content of the skill so you can follow its steps."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "skill_name": {
                    "type": "string",
                    "description": "The skill name exactly as listed in the <skills> block.",
                }
            },
            "required": ["skill_name"],
        }

    async def execute(self, **kwargs: Any) -> str:
        name = kwargs.get("skill_name", "").strip().lower()
        if not name:
            return "Error: skill_name is required."

        if self.skill_repo and self.user_id:
            skill = await self.skill_repo.get_skill(self.user_id, name)
            if skill and skill.get("content"):
                return skill["content"]

        if self.workspace:
            workspace_skill = self.workspace / "skills" / name / "SKILL.md"
            if workspace_skill.exists():
                return workspace_skill.read_text(encoding="utf-8")

        if self.builtin_dir:
            builtin_skill = self.builtin_dir / name / "SKILL.md"
            if builtin_skill.exists():
                return builtin_skill.read_text(encoding="utf-8")

        return await self._not_found(name)

    async def _not_found(self, name: str) -> str:
        """Answer a miss with the names that exist, not just with a failure.

        A model that derives a skill name from context ("area Vendas" ->
        ``projeto-start-2.0``) retries variations until it gives up, and the
        skill it needed is right there under a slightly different name.
        """
        available = await self._available_names()
        if not available:
            return f"Error: skill '{name}' not found."
        close = difflib.get_close_matches(name, available, n=3, cutoff=0.5)
        if close:
            return (
                f"Error: skill '{name}' não existe. Nomes parecidos: "
                f"{', '.join(close)}. Chame read_skill com o nome exato."
            )
        return (
            f"Error: skill '{name}' não existe. Disponíveis: {', '.join(sorted(available))}."
        )

    async def _available_names(self) -> list[str]:
        names: set[str] = set()
        if self.skill_repo and self.user_id:
            for skill in await self.skill_repo.list_skills(self.user_id):
                names.add(skill["name"])
        for directory in (
            self.workspace / "skills" if self.workspace else None,
            self.builtin_dir,
        ):
            if directory and directory.is_dir():
                names.update(
                    entry.name for entry in directory.iterdir()
                    if (entry / "SKILL.md").exists()
                )
        return sorted(names)
