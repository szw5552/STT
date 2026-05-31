import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type MeetingDetail,
  type MeetingListItem,
  type MeetingLocation,
  type MeetingStatus,
  type MeetingSummary,
  type TranscriptArtifact,
  isMeetingSummary,
  isTranscriptArtifact,
} from "@/lib/meetings/schema";

const ROOT_DIR = process.cwd();
const UPLOAD_ROOT = path.join(ROOT_DIR, "upload");
const ARTIFACT_ROOT = path.join(ROOT_DIR, "artifacts");
const COMPLETED_ROOT = path.join(ROOT_DIR, "completed");

const AUDIO_EXTENSIONS = new Set([
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".ogg",
  ".wav",
  ".webm",
]);

const PHOTO_EXTENSIONS = new Set([
  ".avif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

type ResolvedMeetingRoot = {
  sourceLocation: MeetingLocation;
  meetingDir: string;
  audioDir: string;
  photoDir: string;
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

function normalizeSegment(value: string, label: string) {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error(`${label} 格式不合法: ${value}`);
  }

  return value;
}

function humanizeMeetingId(meetingId: string) {
  return meetingId
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

async function ensureDataRoots() {
  await Promise.all([
    fs.mkdir(UPLOAD_ROOT, { recursive: true }),
    fs.mkdir(ARTIFACT_ROOT, { recursive: true }),
    fs.mkdir(COMPLETED_ROOT, { recursive: true }),
  ]);
}

async function readDirectorySafe(directoryPath: string) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function listMeetingIdsFromRoot(rootDir: string) {
  const entries = await readDirectorySafe(rootDir);

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function listFilesByExtension(directoryPath: string, extensions: Set<string>) {
  const entries = await readDirectorySafe(directoryPath);

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => extensions.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

function getArtifactPaths(meetingId: string) {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const artifactDir = path.join(ARTIFACT_ROOT, safeMeetingId);

  return {
    artifactDir,
    transcriptPath: path.join(artifactDir, "transcript.json"),
    summaryPath: path.join(artifactDir, "summary.json"),
  };
}

async function resolveMeetingRoot(meetingId: string): Promise<ResolvedMeetingRoot> {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const uploadDir = path.join(UPLOAD_ROOT, safeMeetingId);

  if (await fileExists(uploadDir)) {
    return {
      sourceLocation: "upload",
      meetingDir: uploadDir,
      audioDir: path.join(uploadDir, "audio"),
      photoDir: path.join(uploadDir, "photos"),
    };
  }

  const completedDir = path.join(COMPLETED_ROOT, safeMeetingId);

  if (await fileExists(completedDir)) {
    return {
      sourceLocation: "completed",
      meetingDir: completedDir,
      audioDir: path.join(completedDir, "audio"),
      photoDir: path.join(completedDir, "photos"),
    };
  }

  throw new Error(`找不到會議資料夾: ${safeMeetingId}`);
}

async function readJsonFile<T>(
  filePath: string,
  validator: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return validator(parsed) ? parsed : null;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function toMeetingStatus(
  sourceLocation: MeetingLocation,
  hasTranscript: boolean,
  hasSummary: boolean,
): MeetingStatus {
  if (!hasTranscript) {
    return "needs-transcription";
  }

  if (!hasSummary) {
    return "needs-summary";
  }

  return sourceLocation === "upload" ? "ready-to-archive" : "archived";
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  await ensureDataRoots();

  const uploadMeetingIds = await listMeetingIdsFromRoot(UPLOAD_ROOT);
  const completedMeetingIds = await listMeetingIdsFromRoot(COMPLETED_ROOT);
  const meetingIds = [...new Set([...uploadMeetingIds, ...completedMeetingIds])];

  const meetings = await Promise.all(
    meetingIds.map(async (meetingId) => {
      const root = await resolveMeetingRoot(meetingId);
      const audioFiles = await listFilesByExtension(root.audioDir, AUDIO_EXTENSIONS);
      const photoFiles = await listFilesByExtension(root.photoDir, PHOTO_EXTENSIONS);
      const { summaryPath, transcriptPath } = getArtifactPaths(meetingId);
      const transcript = await readJsonFile(transcriptPath, isTranscriptArtifact);
      const summary = await readJsonFile(summaryPath, isMeetingSummary);
      const status = toMeetingStatus(
        root.sourceLocation,
        Boolean(transcript),
        Boolean(summary),
      );

      return {
        id: meetingId,
        title: summary?.meeting.title ?? humanizeMeetingId(meetingId),
        sourceLocation: root.sourceLocation,
        status,
        audioCount: audioFiles.length,
        photoCount: photoFiles.length,
        hasTranscript: Boolean(transcript),
        hasSummary: Boolean(summary),
        updatedAt: summary?.meeting.generatedAt ?? transcript?.createdAt,
        kicker: summary?.hero.kicker,
        headline: summary?.hero.headline,
        dek: summary?.hero.dek,
        summaryGeneratedAt: summary?.meeting.generatedAt,
        coverPhotoUrl:
          photoFiles[0] === undefined
            ? undefined
            : `/api/meetings/${encodeURIComponent(meetingId)}/photos/${encodeURIComponent(photoFiles[0])}`,
      } satisfies MeetingListItem;
    }),
  );

  return meetings.sort((left, right) => {
    const statusRank: Record<MeetingStatus, number> = {
      "ready-to-archive": 0,
      archived: 1,
      "needs-summary": 2,
      "needs-transcription": 3,
    };

    const statusDifference = statusRank[left.status] - statusRank[right.status];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return right.id.localeCompare(left.id);
  });
}

export async function getMeetingDetail(meetingId: string): Promise<MeetingDetail> {
  await ensureDataRoots();

  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const root = await resolveMeetingRoot(safeMeetingId);
  const { summaryPath, transcriptPath } = getArtifactPaths(safeMeetingId);
  const transcript = await readJsonFile(transcriptPath, isTranscriptArtifact);
  const summary = await readJsonFile(summaryPath, isMeetingSummary);
  const photos = await listFilesByExtension(root.photoDir, PHOTO_EXTENSIONS);
  const audioFiles = await listFilesByExtension(root.audioDir, AUDIO_EXTENSIONS);
  const status = toMeetingStatus(root.sourceLocation, Boolean(transcript), Boolean(summary));

  return {
    id: safeMeetingId,
    title: summary?.meeting.title ?? humanizeMeetingId(safeMeetingId),
    sourceLocation: root.sourceLocation,
    status,
    audioCount: audioFiles.length,
    photoCount: photos.length,
    hasTranscript: Boolean(transcript),
    hasSummary: Boolean(summary),
    updatedAt: summary?.meeting.generatedAt ?? transcript?.createdAt,
    kicker: summary?.hero.kicker,
    headline: summary?.hero.headline,
    dek: summary?.hero.dek,
    summaryGeneratedAt: summary?.meeting.generatedAt,
    coverPhotoUrl:
      photos[0] === undefined
        ? undefined
        : `/api/meetings/${encodeURIComponent(safeMeetingId)}/photos/${encodeURIComponent(photos[0])}`,
    transcript,
    summary,
    photos: photos.map((fileName) => ({
      fileName,
      url: `/api/meetings/${encodeURIComponent(safeMeetingId)}/photos/${encodeURIComponent(fileName)}`,
    })),
    transcriptPath: path.relative(ROOT_DIR, transcriptPath),
    summaryPath: path.relative(ROOT_DIR, summaryPath),
    sourceAudioPath: path.relative(ROOT_DIR, root.audioDir),
    sourcePhotoPath: path.relative(ROOT_DIR, root.photoDir),
    recommendedCommands: {
      status: `npm run status -- ${safeMeetingId}`,
      transcribe: `npm run transcribe -- ${safeMeetingId}`,
      archive: `npm run archive -- ${safeMeetingId}`,
    },
  };
}

export async function getMeetingPhoto(
  meetingId: string,
  fileName: string,
): Promise<{ body: Buffer; contentType: string }> {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const safeFileName = normalizeSegment(fileName, "photoName");
  const root = await resolveMeetingRoot(safeMeetingId);
  const filePath = path.join(root.photoDir, safeFileName);
  const body = await fs.readFile(filePath);
  const extension = path.extname(safeFileName).toLowerCase();

  const contentType =
    extension === ".avif"
      ? "image/avif"
      : extension === ".heic"
        ? "image/heic"
        : extension === ".png"
          ? "image/png"
          : extension === ".webp"
            ? "image/webp"
            : "image/jpeg";

  return { body, contentType };
}

export async function archiveMeetingRawInput(meetingId: string) {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const uploadDir = path.join(UPLOAD_ROOT, safeMeetingId);
  const completedDir = path.join(COMPLETED_ROOT, safeMeetingId);
  const summary = await readMeetingSummary(safeMeetingId);

  if (!summary) {
    throw new Error("尚未產生 summary.json，不能歸檔原始素材。");
  }

  if (!(await fileExists(uploadDir))) {
    throw new Error("upload/ 內已找不到這場會議的原始素材。");
  }

  if (await fileExists(completedDir)) {
    throw new Error("completed/ 內已存在同名會議，請先確認是否重複歸檔。");
  }

  await fs.mkdir(COMPLETED_ROOT, { recursive: true });
  await fs.rename(uploadDir, completedDir);
}

export async function readMeetingSummary(meetingId: string): Promise<MeetingSummary | null> {
  const { summaryPath } = getArtifactPaths(meetingId);
  return readJsonFile(summaryPath, isMeetingSummary);
}

export async function readTranscriptArtifact(
  meetingId: string,
): Promise<TranscriptArtifact | null> {
  const { transcriptPath } = getArtifactPaths(meetingId);
  return readJsonFile(transcriptPath, isTranscriptArtifact);
}
