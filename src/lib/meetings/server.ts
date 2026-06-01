import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type MeetingDetail,
  type MeetingListItem,
  type MeetingLocation,
  type MeetingPhoto,
  type MeetingStatus,
  type MeetingSummary,
  type PhotoManifestArtifact,
  type TranscriptArtifact,
  isMeetingSummary,
  isPhotoManifestArtifact,
  isTranscriptArtifact,
} from "@/lib/meetings/schema";

const ROOT_DIR = process.cwd();
const UPLOAD_ROOT = path.join(ROOT_DIR, "upload");
const ARTIFACT_ROOT = path.join(ROOT_DIR, "artifacts");
const COMPLETED_ROOT = path.join(ROOT_DIR, "completed");
const PUBLISHED_ROOT = path.join(ROOT_DIR, "published");
const IS_READ_ONLY_DEPLOYMENT =
  process.env.VERCEL === "1" || ROOT_DIR.startsWith("/var/task");

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
  sourcePhotoDir: string;
  artifactDir: string;
  artifactPhotoDir: string;
  photoManifestPath: string;
  transcriptPath: string;
  summaryPath: string;
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === "object" && "code" in error;
}

function getPublishedPaths(meetingId: string) {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const publishedDir = path.join(PUBLISHED_ROOT, safeMeetingId);

  return {
    publishedDir,
    publishedPhotoDir: path.join(publishedDir, "photos"),
    photoManifestPath: path.join(publishedDir, "photo-manifest.json"),
    transcriptPath: path.join(publishedDir, "transcript.json"),
    summaryPath: path.join(publishedDir, "summary.json"),
  };
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

function getArtifactPaths(meetingId: string) {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const artifactDir = path.join(ARTIFACT_ROOT, safeMeetingId);

  return {
    artifactDir,
    artifactPhotoDir: path.join(artifactDir, "photos"),
    photoManifestPath: path.join(artifactDir, "photo-manifest.json"),
    transcriptPath: path.join(artifactDir, "transcript.json"),
    translatedTranscriptPath: path.join(artifactDir, "transcript.zh-TW.txt"),
    summaryPath: path.join(artifactDir, "summary.json"),
  };
}

function guessImageContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  return extension === ".avif"
    ? "image/avif"
    : extension === ".heic"
      ? "image/heic"
      : extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";
}

function buildPhotoUrl(meetingId: string, fileName: string) {
  return `/api/meetings/${encodeURIComponent(meetingId)}/photos/${encodeURIComponent(fileName)}`;
}

function buildSourcePhotoUrl(meetingId: string, fileName: string) {
  return `/api/meetings/${encodeURIComponent(meetingId)}/source-photos/${encodeURIComponent(fileName)}`;
}

async function ensureDataRoots() {
  if (IS_READ_ONLY_DEPLOYMENT) {
    return;
  }

  const ensureDirectory = async (directoryPath: string) => {
    try {
      await fs.mkdir(directoryPath, { recursive: true });
    } catch (error) {
      if (
        isNodeError(error) &&
        (error.code === "EROFS" ||
          error.code === "EACCES" ||
          error.code === "EPERM" ||
          error.code === "ENOENT")
      ) {
        return;
      }

      throw error;
    }
  };

  await Promise.all([
    ensureDirectory(UPLOAD_ROOT),
    ensureDirectory(ARTIFACT_ROOT),
    ensureDirectory(COMPLETED_ROOT),
    ensureDirectory(PUBLISHED_ROOT),
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

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function resolveMeetingRoot(meetingId: string): Promise<ResolvedMeetingRoot> {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const artifactPaths = getArtifactPaths(safeMeetingId);
  const uploadDir = path.join(UPLOAD_ROOT, safeMeetingId);

  if (await fileExists(uploadDir)) {
    return {
      sourceLocation: "upload",
      meetingDir: uploadDir,
      audioDir: path.join(uploadDir, "audio"),
      sourcePhotoDir: path.join(uploadDir, "photos"),
      ...artifactPaths,
    };
  }

  const completedDir = path.join(COMPLETED_ROOT, safeMeetingId);

  if (await fileExists(completedDir)) {
    return {
      sourceLocation: "completed",
      meetingDir: completedDir,
      audioDir: path.join(completedDir, "audio"),
      sourcePhotoDir: path.join(completedDir, "photos"),
      ...artifactPaths,
    };
  }

  const publishedPaths = getPublishedPaths(safeMeetingId);

  if (await fileExists(publishedPaths.publishedDir)) {
    return {
      sourceLocation: "published",
      meetingDir: publishedPaths.publishedDir,
      audioDir: path.join(publishedPaths.publishedDir, "audio"),
      sourcePhotoDir: path.join(publishedPaths.publishedDir, "__source_photos__"),
      artifactDir: publishedPaths.publishedDir,
      artifactPhotoDir: publishedPaths.publishedPhotoDir,
      photoManifestPath: publishedPaths.photoManifestPath,
      transcriptPath: publishedPaths.transcriptPath,
      summaryPath: publishedPaths.summaryPath,
    };
  }

  throw new Error(`找不到會議資料夾: ${safeMeetingId}`);
}

async function readPhotoManifest(root: ResolvedMeetingRoot): Promise<PhotoManifestArtifact | null> {
  return readJsonFile(root.photoManifestPath, isPhotoManifestArtifact);
}

async function hasUsableOptimizedPhotos(
  root: ResolvedMeetingRoot,
  sourcePhotos: string[],
  manifest: PhotoManifestArtifact | null,
) {
  if (sourcePhotos.length === 0) {
    if (root.sourceLocation === "published") {
      if (!manifest) {
        return false;
      }

      const derivedFilesExist = await Promise.all(
        manifest.photos.map((photo) => fileExists(path.join(root.artifactPhotoDir, photo.outputFileName))),
      );

      return derivedFilesExist.every(Boolean);
    }

    return true;
  }

  if (
    !manifest ||
    manifest.photos.length !== sourcePhotos.length ||
    manifest.sourceFiles.length !== sourcePhotos.length
  ) {
    return false;
  }

  const manifestMatchesCurrentFiles = manifest.sourceFiles.every(
    (sourceFile, index) => sourceFile.fileName === sourcePhotos[index],
  );

  if (!manifestMatchesCurrentFiles) {
    return false;
  }

  const derivedFilesExist = await Promise.all(
    manifest.photos.map((photo) => fileExists(path.join(root.artifactPhotoDir, photo.outputFileName))),
  );

  return derivedFilesExist.every(Boolean);
}

async function buildRenderablePhotos(
  root: ResolvedMeetingRoot,
  meetingId: string,
  sourcePhotos: string[],
): Promise<{ hasOptimizedPhotos: boolean; photos: MeetingPhoto[] }> {
  const manifest = await readPhotoManifest(root);
  const hasOptimizedPhotos = await hasUsableOptimizedPhotos(root, sourcePhotos, manifest);

  if (hasOptimizedPhotos && manifest) {
    return {
      hasOptimizedPhotos: true,
      photos: manifest.photos.map((photo) => ({
        fileName: photo.sourceFileName,
        url: buildPhotoUrl(meetingId, photo.outputFileName),
        originalUrl: buildSourcePhotoUrl(meetingId, photo.sourceFileName),
        width: photo.width,
        height: photo.height,
      })),
    };
  }

  return {
    hasOptimizedPhotos: sourcePhotos.length === 0,
    photos: sourcePhotos.map((fileName) => ({
      fileName,
      url: buildPhotoUrl(meetingId, fileName),
      originalUrl: buildSourcePhotoUrl(meetingId, fileName),
    })),
  };
}

function toMeetingStatus(
  sourceLocation: MeetingLocation,
  hasTranscript: boolean,
  hasSummary: boolean,
  hasOptimizedPhotos: boolean,
  photoCount: number,
): MeetingStatus {
  if (sourceLocation === "published") {
    return "archived";
  }

  if (!hasTranscript) {
    return "needs-transcription";
  }

  if (!hasSummary) {
    return "needs-summary";
  }

  if (sourceLocation === "upload" && photoCount > 0 && !hasOptimizedPhotos) {
    return "needs-photo-optimization";
  }

  return sourceLocation === "upload" ? "ready-to-archive" : "archived";
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  await ensureDataRoots();

  const uploadMeetingIds = await listMeetingIdsFromRoot(UPLOAD_ROOT);
  const completedMeetingIds = await listMeetingIdsFromRoot(COMPLETED_ROOT);
  const publishedMeetingIds = await listMeetingIdsFromRoot(PUBLISHED_ROOT);
  const meetingIds = [...new Set([...uploadMeetingIds, ...completedMeetingIds, ...publishedMeetingIds])];

  const meetings = await Promise.all(
    meetingIds.map(async (meetingId) => {
      const root = await resolveMeetingRoot(meetingId);
      const audioFiles = await listFilesByExtension(root.audioDir, AUDIO_EXTENSIONS);
      const sourcePhotos = await listFilesByExtension(root.sourcePhotoDir, PHOTO_EXTENSIONS);
      const transcript = await readJsonFile(root.transcriptPath, isTranscriptArtifact);
      const summary = await readJsonFile(root.summaryPath, isMeetingSummary);
      const { hasOptimizedPhotos, photos } = await buildRenderablePhotos(
        root,
        meetingId,
        sourcePhotos,
      );
      const status = toMeetingStatus(
        root.sourceLocation,
        Boolean(transcript),
        Boolean(summary),
        hasOptimizedPhotos,
        sourcePhotos.length,
      );

      return {
        id: meetingId,
        title: summary?.meeting.title ?? humanizeMeetingId(meetingId),
        sourceLocation: root.sourceLocation,
        status,
        audioCount: audioFiles.length,
        photoCount: sourcePhotos.length,
        hasTranscript: Boolean(transcript),
        hasSummary: Boolean(summary),
        hasOptimizedPhotos,
        updatedAt: summary?.meeting.generatedAt ?? transcript?.createdAt,
        kicker: summary?.hero.kicker,
        headline: summary?.hero.headline,
        dek: summary?.hero.dek,
        summaryGeneratedAt: summary?.meeting.generatedAt,
        coverPhotoUrl: photos[0]?.url,
      } satisfies MeetingListItem;
    }),
  );

  return meetings.sort((left, right) => {
    const statusRank: Record<MeetingStatus, number> = {
      "ready-to-archive": 0,
      archived: 1,
      "needs-photo-optimization": 2,
      "needs-summary": 3,
      "needs-transcription": 4,
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
  const artifactPaths = getArtifactPaths(safeMeetingId);
  const transcript = await readJsonFile(root.transcriptPath, isTranscriptArtifact);
  const summary = await readJsonFile(root.summaryPath, isMeetingSummary);
  const translatedTranscriptText = await readTextFile(artifactPaths.translatedTranscriptPath);
  const sourcePhotos = await listFilesByExtension(root.sourcePhotoDir, PHOTO_EXTENSIONS);
  const audioFiles = await listFilesByExtension(root.audioDir, AUDIO_EXTENSIONS);
  const { hasOptimizedPhotos, photos } = await buildRenderablePhotos(
    root,
    safeMeetingId,
    sourcePhotos,
  );
  const status = toMeetingStatus(
    root.sourceLocation,
    Boolean(transcript),
    Boolean(summary),
    hasOptimizedPhotos,
    sourcePhotos.length,
  );

  return {
    id: safeMeetingId,
    title: summary?.meeting.title ?? humanizeMeetingId(safeMeetingId),
    sourceLocation: root.sourceLocation,
    status,
    audioCount: audioFiles.length,
    photoCount: sourcePhotos.length,
    hasTranscript: Boolean(transcript),
    hasSummary: Boolean(summary),
    hasOptimizedPhotos,
    updatedAt: summary?.meeting.generatedAt ?? transcript?.createdAt,
    kicker: summary?.hero.kicker,
    headline: summary?.hero.headline,
    dek: summary?.hero.dek,
    summaryGeneratedAt: summary?.meeting.generatedAt,
    coverPhotoUrl: photos[0]?.url,
    transcript,
    summary,
    photos,
    translatedTranscriptParagraphs: translatedTranscriptText
      ? translatedTranscriptText
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
      : [],
    translatedTranscriptPath: translatedTranscriptText
      ? path.relative(ROOT_DIR, artifactPaths.translatedTranscriptPath)
      : undefined,
    transcriptPath: path.relative(ROOT_DIR, root.transcriptPath),
    summaryPath: path.relative(ROOT_DIR, root.summaryPath),
    sourceAudioPath: path.relative(ROOT_DIR, root.audioDir),
    sourcePhotoPath: path.relative(ROOT_DIR, root.sourcePhotoDir),
    recommendedCommands: {
      status: `npm run status -- ${safeMeetingId}`,
      transcribe: `npm run transcribe -- ${safeMeetingId}`,
      optimizePhotos: `npm run optimize-photos -- ${safeMeetingId}`,
      archive: `npm run archive -- ${safeMeetingId}`,
    },
  };
}

export async function getMeetingPhoto(
  meetingId: string,
  fileName: string,
): Promise<{ body: Buffer; cacheControl: string; contentType: string }> {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const safeFileName = normalizeSegment(fileName, "photoName");
  const root = await resolveMeetingRoot(safeMeetingId);
  const artifactPath = path.join(root.artifactPhotoDir, safeFileName);

  if (await fileExists(artifactPath)) {
    return {
      body: await fs.readFile(artifactPath),
      cacheControl: "public, max-age=31536000, immutable",
      contentType: guessImageContentType(safeFileName),
    };
  }

  const sourcePath = path.join(root.sourcePhotoDir, safeFileName);

  return {
    body: await fs.readFile(sourcePath),
    cacheControl: "no-store",
    contentType: guessImageContentType(safeFileName),
  };
}

export async function getMeetingSourcePhoto(
  meetingId: string,
  fileName: string,
): Promise<{ body: Buffer; cacheControl: string; contentType: string }> {
  const safeMeetingId = normalizeSegment(meetingId, "meetingId");
  const safeFileName = normalizeSegment(fileName, "photoName");
  const root = await resolveMeetingRoot(safeMeetingId);
  const sourcePath = path.join(root.sourcePhotoDir, safeFileName);

  return {
    body: await fs.readFile(sourcePath),
    cacheControl: "no-store",
    contentType: guessImageContentType(safeFileName),
  };
}

async function ensurePhotoDerivativesReady(root: ResolvedMeetingRoot) {
  const sourcePhotos = await listFilesByExtension(root.sourcePhotoDir, PHOTO_EXTENSIONS);
  const manifest = await readPhotoManifest(root);

  if (!(await hasUsableOptimizedPhotos(root, sourcePhotos, manifest))) {
    throw new Error("照片 webp 衍生檔尚未完成，請先執行 npm run optimize-photos。");
  }
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

  const root = await resolveMeetingRoot(safeMeetingId);
  await ensurePhotoDerivativesReady(root);
  await fs.mkdir(COMPLETED_ROOT, { recursive: true });
  await fs.rename(uploadDir, completedDir);
}

export async function readMeetingSummary(meetingId: string): Promise<MeetingSummary | null> {
  const { summaryPath } = getArtifactPaths(meetingId);
  const summary = await readJsonFile(summaryPath, isMeetingSummary);

  if (summary) {
    return summary;
  }

  const publishedPaths = getPublishedPaths(meetingId);
  return readJsonFile(publishedPaths.summaryPath, isMeetingSummary);
}

export async function readTranscriptArtifact(
  meetingId: string,
): Promise<TranscriptArtifact | null> {
  const { transcriptPath } = getArtifactPaths(meetingId);
  const transcript = await readJsonFile(transcriptPath, isTranscriptArtifact);

  if (transcript) {
    return transcript;
  }

  const publishedPaths = getPublishedPaths(meetingId);
  return readJsonFile(publishedPaths.transcriptPath, isTranscriptArtifact);
}
