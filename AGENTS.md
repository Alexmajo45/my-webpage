# Agents

Instructions for any coding agent working in this repository are in [CLAUDE.md](CLAUDE.md). The roles, memory rules and review gates are described in [docs/03-agent-operating-model.md](docs/03-agent-operating-model.md).

The role definitions under `.claude/agents/` are plain Markdown prompts. Harnesses other than Claude Code can use them as subagent prompts provided each reviewer is started in a fresh context; a review run inside the author's context does not count.
