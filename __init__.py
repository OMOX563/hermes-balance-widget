"""hermes-balance-widget — agent-side stub.

The real surface of this plugin is the desktop widget
(``desktop/plugin.js``, installed to ``~/.hermes/desktop-plugins/hermes-balance-widget/``).

Nothing needs to run in the agent process: the plugin registers no tools, no
hooks and no commands. This module exists so the plugin is a well-formed
directory plugin that ``hermes plugins enable/disable`` and the
``plugins.enabled`` trust gate can address by name.
"""

from __future__ import annotations


def register(ctx) -> None:  # noqa: ARG001 - contract signature requires the context
    """No agent-side contributions by design (desktop-only plugin)."""
    return None
