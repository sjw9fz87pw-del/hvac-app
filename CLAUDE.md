# Notes for Claude

## Keep the owner's Obsidian notes up to date

The owner keeps notes about this app in Obsidian. They live in the private
repository **`sjw9fz87pw-del/hvac-app-notes`** (the whole vault), which syncs to
their Mac every few minutes. The app's notes are in its `Equipment Care/`
folder; start at `Equipment Care/00 Home.md`.

After any work in this repository, or any question answered about the app:

1. Attach the notes repository with push access (`add_repo`) and clone it.
   Pull first, because the owner may have edited notes in Obsidian.
2. Update what changed: `Timeline.md`, `Open items.md`, `Your setup today.md`,
   the relevant `Features/` and `How-to/` notes, `Technical/Commit history.md`
   and `Conversation log.md`.
3. Commit and push to `main`. Never force-push.

The notes repository's own `CLAUDE.md` has the rules for writing notes. Write
plain language for a non-technical owner, change only `Equipment Care/`, and
never put passwords, tokens or secret values in a note.

## Where things are

- The app is on branch `claude/restaurant-maintenance-platform-dydlsy`. `main`
  holds only an early placeholder; never push it over the app branch.
- Live site: https://clearline-equipment-care.netlify.app (health check at
  `/api/v1/health`).
- Start with `README.md` and `docs/ARCHITECTURE.md`. NFC tag work follows the
  `hvac-nfc-tags` skill.
