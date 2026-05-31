import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const ROOT_DIR = process.cwd();
export const UPLOAD_ROOT = path.join(ROOT_DIR, "upload");
export const ARTIFACT_ROOT = path.join(ROOT_DIR, "artifacts");
export const COMPLETED_ROOT = path.join(ROOT_DIR, "completed");

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

function isNodeError(error) {
  return error !== null && typeof error === "object" && "code" in error;
}

async function readDirSafe(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function ensurePipelineDirectories() {
  await Promise.all([
    fs.mkdir(UPLOAD_ROOT, { recursive: true }),
    fs.mkdir(ARTIFACT_ROOT, { recursive: true }),
    fs.mkdir(COMPLETED_ROOT, { recursive: true }),
  ]);
}

export function assertSafeSegment(value, label) {
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

export function getMeetingDirectories(meetingId) {
  const safeMeetingId = assertSafeSegment(meetingId, "meetingId");

  return {
    meetingId: safeMeetingId,
    uploadDir: path.join(UPLOAD_ROOT, safeMeetingId),
    uploadAudioDir: path.join(UPLOAD_ROOT, safeMeetingId, "audio"),
    uploadPhotoDir: path.join(UPLOAD_ROOT, safeMeetingId, "photos"),
    artifactDir: path.join(ARTIFACT_ROOT, safeMeetingId),
    transcriptPath: path.join(ARTIFACT_ROOT, safeMeetingId, "transcript.json"),
    summaryPath: path.join(ARTIFACT_ROOT, safeMeetingId, "summary.json"),
    completedDir: path.join(COMPLETED_ROOT, safeMeetingId),
    completedAudioDir: path.join(COMPLETED_ROOT, safeMeetingId, "audio"),
    completedPhotoDir: path.join(COMPLETED_ROOT, safeMeetingId, "photos"),
  };
}

export async function listMeetingIds(sourceRoot = UPLOAD_ROOT) {
  const entries = await readDirSafe(sourceRoot);

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function listFiles(directoryPath, allowedExtensions) {
  const entries = await readDirSafe(directoryPath);

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => allowedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

export async function listMeetingAudioFiles(meetingId) {
  const { uploadAudioDir } = getMeetingDirectories(meetingId);
  return listFiles(uploadAudioDir, AUDIO_EXTENSIONS);
}

export async function listMeetingPhotoFiles(meetingId) {
  const { uploadPhotoDir, completedPhotoDir } = getMeetingDirectories(meetingId);
  const uploadPhotos = await listFiles(uploadPhotoDir, PHOTO_EXTENSIONS);

  if (uploadPhotos.length > 0) {
    return uploadPhotos;
  }

  return listFiles(completedPhotoDir, PHOTO_EXTENSIONS);
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function fileExists(filePath) {
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

export async function sha256File(filePath) {
  const content = await fs.readFile(filePath);
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

export function guessMimeType(fileName) {
  switch (path.extname(fileName).toLowerCase()) {
    case ".flac":
      return "audio/flac";
    case ".m4a":
      return "audio/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
      return "audio/mp4";
    case ".mpeg":
    case ".mpga":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "audio/webm";
    case ".avif":
      return "image/avif";
    case ".heic":
      return "image/heic";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
