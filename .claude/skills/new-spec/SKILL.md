---
name: new-spec
description: Start or update a spec in docs/specs/ for a major change, and keep it current while working. Use at the start of a big change and when finishing items.
---

# Specs

1. **Start:** copy `docs/specs/_template.md` to the next number (`NNN-short-kebab-name.md`), fill in Goal and
   Requirements, add a row to the index in `docs/specs/README.md` (status *In progress*).
2. **While working:** tick items under *Done* as they ship; deferred items go under *Known limitations* or *Possible
   next steps*. Scope and outcome only, not implementation details.
3. **Finish:** status *Done* in the spec and the index.
4. **Never rewrite a finished spec.** If later work changes earlier behaviour, say so in the new spec.
5. **Only read what you need:** the active spec, plus a finished one only when the task touches its feature. Backlog
   ideas live in `docs/tasks/`; turn one into a spec when work starts.
