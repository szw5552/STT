---
name: meeting-summary
description: Use when you need to turn a transcript artifact into a structured zh-TW meeting summary JSON for this project without calling a separate headless LLM API.
---

Generate a Traditional Chinese meeting summary for this repository's pipeline.

## Goal

Read one `artifacts/<meeting-id>/transcript.json` file, then write a matching
`artifacts/<meeting-id>/summary.json` file that follows the schema in
`.agents/skills/meeting-summary/summary.schema.json`.

## Required workflow

1. Read `artifacts/<meeting-id>/transcript.json`.
   - The transcript may come from multiple source audio files.
   - Those source files are ordered by filename.
   - A single source file may itself have been split into multiple ordered upload
     segments before transcription because of Groq's 25 MB limit.
2. Read `.agents/skills/meeting-summary/summary.schema.json`.
3. Infer the meeting's main topic, attendees, agenda, highlights, decisions,
   action items, and memorable quotes from the full combined transcript text
   across all files and segments.
4. Write valid JSON to `artifacts/<meeting-id>/summary.json`.

## Output rules

- Every user-facing string must be in Traditional Chinese (`zh-TW`).
- The JSON must be valid, with no Markdown fences and no trailing comments.
- `meeting.id` must exactly match the folder name.
- `meeting.language` must always be `"zh-TW"`.
- Translate English or simplified Chinese source material into natural `zh-TW`.
- If a field cannot be inferred confidently, prefer an empty array or omit the
  optional value instead of inventing facts.
- Quotes should stay close to the source wording, but can be normalized into
  readable zh-TW punctuation.

## Style

- Keep the voice warm, precise, and edited, like a carefully prepared meeting
  note in a lifestyle magazine.
- Prioritize what happened, what was decided, and what people should do next.
- Avoid generic filler, sales language, and vague summaries.
