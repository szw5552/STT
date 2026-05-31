# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The first end-to-end version of the project now exists:

- `upload/<meeting-id>/audio/*` and `upload/<meeting-id>/photos/*` are the hot input contract.
- `scripts/transcribe-meeting.mjs` sends audio in `upload/` to Groq Whisper and writes `artifacts/<meeting-id>/transcript.json`.
- `.agents/skills/meeting-pipeline/` defines the main orchestration skill that can inspect state, transcribe, summarize, and archive in one run.
- `.agents/skills/meeting-summary/` remains available as the summary-only sub-skill.
- `scripts/archive-meeting.mjs` moves processed raw inputs from `upload/<meeting-id>` to `completed/<meeting-id>` after `summary.json` exists.
- The Next.js app reads these artifacts from disk and renders a zh-TW Japanese-magazine-style page at `/meetings/<meeting-id>`.

## What this project is

An agent-skill project that turns a folder of meeting **audio recordings** and **photos** (`upload/`) into a single **Japanese-magazine-style web page** summarizing the meeting.

End-to-end pipeline:

1. **Transcribe** — audio files from `upload/` are sent to **Groq** (Whisper speech-to-text) to produce raw transcripts.
2. **Summarize** — the raw transcript is passed through the repository-local skill flow, with `meeting-pipeline` as the default entry point and `meeting-summary` as the focused summary-only path. The summary must always be produced in **Traditional Chinese (zh-TW)** — translate English (or other non-zh-TW) transcripts as part of this step.
3. **Compose** — the summary is combined with the meeting photos and rendered as one Japanese-magazine-style page.
4. **Serve** — the page is delivered by a **Next.js** app.

## Architecture notes (design intent)

The pipeline is the core of the project — keep its stages decoupled so each can be run and debugged independently:

- **Stage boundaries are data, not function calls.** Each stage should write its output (transcript JSON, summary JSON) to disk so a later stage can be re-run without redoing earlier expensive/paid steps (Groq transcription and LLM calls both cost money and time). Treat transcription and summarization as cacheable by input file hash.
- **`upload/` is the single input contract.** One meeting lives in `upload/<meeting-id>/`, with `audio/` and `photos/` subfolders. The pipeline discovers meetings from this folder instead of taking individual file paths.
- **The "Japanese magazine" look is a presentation concern**, separate from the content pipeline. The summary should be plain structured data (sections, headings, key points, attendees, decisions); the magazine layout (typography, vertical rhythm, photo placement) is a Next.js rendering layer on top of that data. Keep them separable so the layout can change without touching transcription/summarization.
- **Output language is always zh-TW.** Regardless of whether the audio is Chinese or English, the meeting summary and the rendered web page must be in Traditional Chinese (zh-TW). Set the page `lang="zh-TW"` and ensure all generated/static UI copy is Traditional Chinese.
- **Raw input leaves `upload/` after success.** Once `summary.json` is present, archive the original audio and photos by moving the whole meeting folder into `completed/<meeting-id>/`. The web app must still be able to read the photos after that move.

## Secrets

Groq needs an API key. Use a `.env.local` (Next.js convention) and keep it out of version control. The Groq key must only be used server-side or in local CLI scripts, never shipped to the client.

Current env vars:

- `GROQ_API_KEY` — required for `npm run transcribe`
- `GROQ_TRANSCRIPTION_MODEL` — optional override, defaults to `whisper-large-v3-turbo`

## Commands

Next.js app:

- `npm run dev` — start the dev server (Turbopack).
- `npm run build` — production build.
- `npm run start` — serve the production build.
- `npm run lint` — run ESLint.
- `npm run status -- <meeting-id>` — inspect the current stage of one meeting (or all meetings with no argument)
- `npm run transcribe -- <meeting-id>` — transcribe one meeting from `upload/<meeting-id>/audio/` into `artifacts/<meeting-id>/transcript.json`
- `npm run transcribe` — transcribe every meeting currently found under `upload/`
- `npm run archive -- <meeting-id>` — move `upload/<meeting-id>/` into `completed/<meeting-id>/` after `summary.json` exists
- `npm run archive` — archive every meeting currently ready inside `upload/`

Primary orchestration skill:

- Use the `meeting-pipeline` skill for the end-to-end flow.
- Status command: `npm run status -- <meeting-id>`
- It can resume from the current stage instead of forcing the whole pipeline every time.

Summary-only skill:

- Use the `meeting-summary` skill.
- Input: `artifacts/<meeting-id>/transcript.json`
- Schema contract: `.agents/skills/meeting-summary/summary.schema.json`
- Output: `artifacts/<meeting-id>/summary.json`

Important paths:

- `src/lib/meetings/server.ts` — filesystem discovery, artifact reads, photo serving, archive logic
- `src/app/page.tsx` — meeting index / workflow overview
- `src/app/meetings/[meetingId]/page.tsx` — Japanese-magazine-style meeting page
- `src/app/api/meetings/[meetingId]/photos/[photoName]/route.ts` — serves photos from either `upload/` or `completed/`

@AGENTS.md
