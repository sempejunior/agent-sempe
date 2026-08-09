"""Branches an agent must never write to.

The default branch is a fact git publishes, so it is discovered. ``develop`` is
a convention no remote declares, so it is named here — and naming it is the
whole point: a delegation that is allowed to commit is only safe if "not on a
protected branch" is checked in code, not asked for in a prompt.

Shared by the ``repo`` tool and the code agent so the rule cannot drift between
the tool that commits and the tool that delegates.
"""

from __future__ import annotations

PROTECTED_BRANCHES = frozenset({"main", "master", "develop", "development"})


def is_protected(branch: str, default_branch: str = "") -> bool:
    """Whether writing to this branch is refused."""
    name = branch.strip().lower()
    if not name:
        return True
    return name in PROTECTED_BRANCHES or name == default_branch.strip().lower()


def protected_names(default_branch: str = "") -> str:
    """The refused names, for an error message that teaches the rule."""
    names = set(PROTECTED_BRANCHES)
    if default_branch.strip():
        names.add(default_branch.strip().lower())
    return ", ".join(sorted(names))
