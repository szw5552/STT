---
name: meeting-pipeline
description: Use when you want one skill to take a meeting from upload/ through transcription, zh-TW summary generation, photo webp generation, and archive, resuming safely from the current stage.
---

Run the full meeting pipeline for this repository.

## Goal

Take one meeting folder from `upload/<meeting-id>/` to a ready page at
`/meetings/<meeting-id>` by handling these stages in order:

1. inspect current state,
2. transcribe audio with Groq when needed,
3. write `artifacts/<meeting-id>/summary.json` in zh-TW,
4. write `artifacts/<meeting-id>/transcript.zh-TW.txt` as a polished readable Traditional Chinese transcript,
5. convert every meeting photo into webp derivatives,
6. archive raw inputs into `completed/<meeting-id>/` once the summary, polished transcript, and webp photos exist.

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
   - Treat every audio file under `upload/<meeting-id>/audio/` as part of the same
     meeting transcript.
   - Process those source audio files in filename order.
   - If any single source audio file is larger than Groq's 25 MB upload limit,
     split it into ordered segments first, then upload those segments in order.
   - Preserve the transcript as one `artifacts/<meeting-id>/transcript.json`
     artifact for the whole meeting, with metadata that keeps both source-file
     order and any segment order explicit.
4. Run `npm run status -- <meeting-id>` again.
5. If `nextAction` is `summarize`:
   - read `artifacts/<meeting-id>/transcript.json`,
   - read `.agents/skills/meeting-summary/summary.schema.json`,
   - treat the transcript as the combined content of all source audio files and
     segments in order,
   - write a valid zh-TW `artifacts/<meeting-id>/summary.json`.
6. Ensure `artifacts/<meeting-id>/transcript.zh-TW.txt` exists and matches the current transcript.
   - Read `artifacts/<meeting-id>/transcript.json` as the source of truth.
   - Translate English or mixed-language transcript content into natural Traditional Chinese.
   - Lightly polish for readability: fix obvious transcription errors, add paragraph breaks, normalize punctuation, and add speaker labels when inferable.
   - Preserve the meeting content and order. Do not summarize, omit major sections, or invent details.
   - This file is the full transcript shown on the meeting page, so make it complete enough for someone to read after expanding the transcript section.
   - If the transcript already has a current polished zh-TW file and the audio/transcript has not changed, keep it.
7. Run `npm run status -- <meeting-id>` again.
8. If `nextAction` is `optimize-photos`, run `npm run optimize-photos -- <meeting-id>`.
9. Run `npm run status -- <meeting-id>` again.
10. If `nextAction` is `archive`, run `npm run archive -- <meeting-id>`.
11. After archive, copy or confirm `transcript.zh-TW.txt` is also present in `published/<meeting-id>/` when a published bundle is generated.
12. Run `npm run status -- <meeting-id>` one last time and confirm the meeting is
   now `done`, then report the page path.

## Output rules

- Never use a separate headless LLM API for the summary step.
- All user-facing summary content must be Traditional Chinese (`zh-TW`).
- Keep `meeting.id` exactly equal to the folder name.
- Respect the JSON schema exactly. No Markdown fences or comments.
- If the transcript already matches the current audio hashes, keep the cached
  transcript instead of forcing a rewrite.
- Do not create one summary per audio file or per split segment; the meeting
  always ends with one combined transcript and one combined summary.
- Convert every photo found under `upload/<meeting-id>/photos` into a cached webp derivative before archiving.
- Only archive after `summary.json`, `transcript.zh-TW.txt`, and the webp derivatives exist.
- The meeting page should display the polished `transcript.zh-TW.txt` as the expandable full transcript; do not leave the page using raw English or mixed-language `transcript.json.text` when a polished zh-TW transcript can be produced.

## Polished transcript rules

- Write `artifacts/<meeting-id>/transcript.zh-TW.txt` for every completed meeting.
- The transcript must be Traditional Chinese, lightly edited, and easy to read.
- Preserve the original sequence and substance. This is a readable full transcript, not another summary.
- Use paragraph breaks generously and speaker labels when they are clear from context.
- Translate English source material naturally into zh-TW; normalize simplified Chinese into zh-TW.
- Remove filler only when it is clearly transcription noise and does not change meaning.
- Prefer complete coverage over elegance; do not compress long sections into a short recap.

## Summary writing rules

- Translate non-zh-TW source material into natural Traditional Chinese.
- Keep the writing edited, concrete, and useful for someone reopening the page later.
- Prefer empty arrays or omitted optional fields over invented facts.
- Focus on agenda, highlights, narrative context, and memorable quotes.
- Do not create separate decisions or action item sections unless the user explicitly asks for them.

## Useful commands

- `npm run status -- <meeting-id>`
- `npm run transcribe -- <meeting-id>`
- `npm run optimize-photos -- <meeting-id>`
- `npm run archive -- <meeting-id>`
