#!/usr/bin/env bash
# Session-start hook for the Master (the elephant): prints project state into the session's context.
# Reviewers must not receive this, which is why it is a hook on the main session and not part of CLAUDE.md.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$root/memory/PROJECT.md" ] || exit 0
echo "=== Project memory (memory/PROJECT.md) ==="
cat "$root/memory/PROJECT.md"
echo
echo "=== Open backlog cards (memory/BACKLOG.md) ==="
grep -E '^\| [A-Z0-9]+-[0-9]+ \| (todo|doing|review|blocked) ' "$root/memory/BACKLOG.md" || echo "(none open)"
echo
echo "Decisions are in memory/DECISIONS.md; session notes in memory/JOURNAL.md. Read them before reopening a settled question."
