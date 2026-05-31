---
name: meeting-pipeline
description: Use when you want one skill to take a meeting from upload/ through transcription, zh-TW summary generation, and archive, resuming safely from the current stage.
---

Run the full meeting pipeline for this repository.

## Goal

Take one meeting folder from `upload/<meeting-id>/` to a ready page at
`/meetings/<meeting-id>` by handling these stages in order:

1. inspect current state,
2. transcribe audio with Groq when needed,
3. write `artifacts/<meeting-id>/summary.json` in zh-TW,
4. archive raw inputs into `completed/<meeting-id>/` once the summary exists.

This skill is the primary entry point for the workflow. Use
`meeting-summary` only when the user specifically wants to edit or regenerate
the summary step by itself.

## Required workflow

1. Decide the target `meeting-id`.
   - If the user names a meeting, use it.
   - If no meeting is specified, inspect `npm run status` and choose the single
     pending meeting. If there are multiple pending meetings, ask the user which
     one to process before continuing.
2. Run `npm run status -- <meeting-id>` and inspect `nextAction`.
3. If `nextAction` is `transcribe`, run `npm run transcribe -- <meeting-id>`.
4. Run `npm run status -- <meeting-id>` again.
5. If `nextAction` is `summarize`:
   - read `artifacts/<meeting-id>/transcript.json`,
   - read `.agents/skills/meeting-summary/summary.schema.json`,
   - write a valid zh-TW `artifacts/<meeting-id>/summary.json`.
6. Run `npm run status -- <meeting-id>` again.
7. If `nextAction` is `archive`, run `npm run archive -- <meeting-id>`.
8. Run `npm run status -- <meeting-id>` one last time and confirm the meeting is
   now `done`, then report the page path.

## Output rules

- Never use a separate headless LLM API for the summary step.
- All user-facing summary content must be Traditional Chinese (`zh-TW`).
- Keep `meeting.id` exactly equal to the folder name.
- Respect the JSON schema exactly. No Markdown fences or comments.
- If the transcript already matches the current audio hashes, keep the cached
  transcript instead of forcing a rewrite.
- Only archive after `summary.json` exists.

## Summary writing rules

- Translate non-zh-TW source material into natural Traditional Chinese.
- Keep the writing edited, concrete, and useful for someone reopening the page later.
- Prefer empty arrays or omitted optional fields over invented facts.
- Focus on agenda, highlights, decisions, action items, and memorable quotes.

## Useful commands

- `npm run status -- <meeting-id>`
- `npm run transcribe -- <meeting-id>`
- `npm run archive -- <meeting-id>`
