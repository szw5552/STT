#!/usr/bin/env node

import nextEnv from "@next/env";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);
const GROQ_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const GROQ_TARGET_UPLOAD_BYTES = 24 * 1024 * 1024;
const MIN_SEGMENT_DURATION_SECONDS = 15;
const MAX_SEGMENT_SPLIT_ATTEMPTS = 8;

loadEnvConfig(ROOT_DIR);

const model = process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3-turbo";
const requestedMeetingIds = process.argv.slice(2);
let hasCheckedFfmpeg = false;

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

async function ensureFfmpegAvailable() {
  if (hasCheckedFfmpeg) {
    return;
  }

  try {
    await Promise.all([
      execFileAsync("ffmpeg", ["-version"]),
      execFileAsync("ffprobe", ["-version"]),
    ]);
  } catch {
    throw new Error(
      "需要 ffmpeg 與 ffprobe 才能切割超過 25 MB 的音檔，請先安裝後再重試。",
    );
  }

  hasCheckedFfmpeg = true;
}

async function getAudioDurationSeconds(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const durationSeconds = Number.parseFloat(stdout.trim());

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`無法判斷音檔時長：${filePath}`);
  }

  return durationSeconds;
}

function buildSegmentFileName(sourceFileName, segmentIndex) {
  const parsed = path.parse(sourceFileName);
  return `${parsed.name}.part-${String(segmentIndex + 1).padStart(4, "0")}${parsed.ext}`;
}

async function splitOversizedAudio(sourceFile) {
  await ensureFfmpegAvailable();

  const durationSeconds = await getAudioDurationSeconds(sourceFile.filePath);
  let segmentDurationSeconds = Math.max(
    MIN_SEGMENT_DURATION_SECONDS,
    Math.floor((durationSeconds * GROQ_TARGET_UPLOAD_BYTES) / sourceFile.sizeBytes),
  );

  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "stt-audio-segments-"));
  const parsed = path.parse(sourceFile.fileName);

  try {
    for (let attempt = 0; attempt < MAX_SEGMENT_SPLIT_ATTEMPTS; attempt += 1) {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(tempDir, { recursive: true });

      const outputPattern = path.join(tempDir, `${parsed.name}.part-%04d${parsed.ext}`);

      await execFileAsync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        sourceFile.filePath,
        "-map",
        "0",
        "-f",
        "segment",
        "-segment_time",
        String(segmentDurationSeconds),
        "-reset_timestamps",
        "1",
        "-c",
        "copy",
        outputPattern,
      ]);

      const segmentFileNames = (await fs.readdir(tempDir))
        .filter((fileName) => path.extname(fileName).toLowerCase() === parsed.ext.toLowerCase())
        .sort((left, right) => left.localeCompare(right));

      if (segmentFileNames.length === 0) {
        throw new Error(`切割後沒有產生任何片段：${sourceFile.fileName}`);
      }

      const segments = await Promise.all(
        segmentFileNames.map(async (segmentFileName, index) => {
          const filePath = path.join(tempDir, segmentFileName);
          const stats = await fs.stat(filePath);

          return {
            segmentIndex: index,
            fileName: buildSegmentFileName(sourceFile.fileName, index),
            filePath,
            sizeBytes: stats.size,
            sha256: await sha256File(filePath),
          };
        }),
      );

      if (segments.every((segment) => segment.sizeBytes <= GROQ_MAX_UPLOAD_BYTES)) {
        return {
          cleanup: async () => fs.rm(tempDir, { recursive: true, force: true }),
          segments,
        };
      }

      if (segmentDurationSeconds <= MIN_SEGMENT_DURATION_SECONDS) {
        break;
      }

      segmentDurationSeconds = Math.max(
        MIN_SEGMENT_DURATION_SECONDS,
        Math.floor(segmentDurationSeconds / 2),
      );
    }
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  await fs.rm(tempDir, { recursive: true, force: true });
  throw new Error(
    `無法把 ${sourceFile.fileName} 切成符合 Groq 25 MB 上限的片段，請先手動縮短或壓縮音檔。`,
  );
}

async function getUploadPlan(sourceFile) {
  if (sourceFile.sizeBytes <= GROQ_MAX_UPLOAD_BYTES) {
    return {
      uploadStrategy: "single",
      cleanup: async () => {},
      segments: [
        {
          segmentIndex: 0,
          fileName: sourceFile.fileName,
          filePath: sourceFile.filePath,
          sizeBytes: sourceFile.sizeBytes,
          sha256: sourceFile.sha256,
        },
      ],
    };
  }

  const split = await splitOversizedAudio(sourceFile);

  return {
    uploadStrategy: "split",
    cleanup: split.cleanup,
    segments: split.segments,
  };
}

async function transcribeSourceFile(client, sourceFile, fileIndex) {
  const uploadPlan = await getUploadPlan(sourceFile);

  try {
    const segmentTexts = [];

    for (const segment of uploadPlan.segments) {
      const response = await client.audio.transcriptions.create({
        file: createReadStream(segment.filePath),
        model,
        response_format: "json",
      });

      segmentTexts.push(response.text.trim());
    }

    return {
      chunk: {
        fileName: sourceFile.fileName,
        fileIndex,
        segmentCount: uploadPlan.segments.length,
        text: segmentTexts.filter(Boolean).join("\n").trim(),
      },
      sourceFile: {
        ...sourceFile,
        fileIndex,
        uploadStrategy: uploadPlan.uploadStrategy,
        uploadSegments: uploadPlan.segments.map((segment) => ({
          segmentIndex: segment.segmentIndex,
          fileName: segment.fileName,
          sizeBytes: segment.sizeBytes,
          sha256: segment.sha256,
        })),
      },
    };
  } finally {
    await uploadPlan.cleanup();
  }
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
  const sourceFilesWithUploadMetadata = [];

  for (const [fileIndex, sourceFile] of sourceFiles.entries()) {
    const transcription = await transcribeSourceFile(client, sourceFile, fileIndex);
    chunks.push(transcription.chunk);
    sourceFilesWithUploadMetadata.push(transcription.sourceFile);
  }

  const transcript = {
    schemaVersion: 1,
    meetingId,
    createdAt: new Date().toISOString(),
    model,
    sourceFiles: sourceFilesWithUploadMetadata,
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
