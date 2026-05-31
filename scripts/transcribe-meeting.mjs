#!/usr/bin/env node

import nextEnv from "@next/env";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import Groq from "groq-sdk";
import {
  ROOT_DIR,
  ensurePipelineDirectories,
  getMeetingDirectories,
  guessMimeType,
  listMeetingAudioFiles,
  listMeetingIds,
  readJsonIfExists,
  sha256File,
  writeJson,
} from "./lib/meeting-paths.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(ROOT_DIR);

const model = process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3-turbo";
const requestedMeetingIds = process.argv.slice(2);

if (!process.env.GROQ_API_KEY) {
  throw new Error("缺少 GROQ_API_KEY，請在 .env.local 設定後再執行轉錄。");
}

function isTranscriptArtifact(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray(value.sourceFiles) &&
    typeof value.text === "string"
  );
}

async function buildSourceFile(meetingId, fileName) {
  const directories = getMeetingDirectories(meetingId);
  const filePath = path.join(directories.uploadAudioDir, fileName);
  const stats = await fs.stat(filePath);

  return {
    fileName,
    filePath,
    mimeType: guessMimeType(fileName),
    sizeBytes: stats.size,
    sha256: await sha256File(filePath),
  };
}

async function transcribeMeeting(client, meetingId) {
  const directories = getMeetingDirectories(meetingId);
  const audioFiles = await listMeetingAudioFiles(meetingId);

  if (audioFiles.length === 0) {
    throw new Error(`upload/${meetingId}/audio 內找不到可轉錄的音檔。`);
  }

  const sourceFiles = await Promise.all(
    audioFiles.map((fileName) => buildSourceFile(meetingId, fileName)),
  );

  const existing = await readJsonIfExists(directories.transcriptPath);

  if (
    isTranscriptArtifact(existing) &&
    existing.sourceFiles.length === sourceFiles.length &&
    existing.sourceFiles.every(
      (sourceFile, index) =>
        sourceFile.fileName === sourceFiles[index]?.fileName &&
        sourceFile.sha256 === sourceFiles[index]?.sha256,
    )
  ) {
    console.log(`- ${meetingId}: 音檔未變更，沿用既有 transcript.json`);
    return;
  }

  const chunks = [];

  for (const sourceFile of sourceFiles) {
    const response = await client.audio.transcriptions.create({
      file: createReadStream(sourceFile.filePath),
      model,
      response_format: "json",
    });

    chunks.push({
      fileName: sourceFile.fileName,
      text: response.text.trim(),
    });
  }

  const transcript = {
    schemaVersion: 1,
    meetingId,
    createdAt: new Date().toISOString(),
    model,
    sourceFiles,
    chunks,
    text: chunks.map((chunk) => `[${chunk.fileName}]\n${chunk.text}`).join("\n\n"),
  };

  await writeJson(directories.transcriptPath, transcript);
  console.log(`- ${meetingId}: 已寫入 artifacts/${meetingId}/transcript.json`);
}

async function main() {
  await ensurePipelineDirectories();

  const meetingIds =
    requestedMeetingIds.length > 0
      ? requestedMeetingIds
      : await listMeetingIds();

  if (meetingIds.length === 0) {
    console.log("upload/ 目前沒有待轉錄的會議資料夾。");
    return;
  }

  const client = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 120_000,
  });

  console.log(`開始用 ${model} 轉錄 ${meetingIds.length} 場會議...`);

  for (const meetingId of meetingIds) {
    await transcribeMeeting(client, meetingId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
