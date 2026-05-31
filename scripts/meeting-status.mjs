#!/usr/bin/env node

import path from "node:path";
import {
  ARTIFACT_ROOT,
  COMPLETED_ROOT,
  UPLOAD_ROOT,
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  isPhotoManifestArtifact,
  listMeetingAudioFiles,
  listMeetingIds,
  listMeetingPhotoFiles,
  readJsonIfExists,
  sha256File,
  sourceFilesMatchManifest,
} from "./lib/meeting-paths.mjs";

const requestedMeetingIds = process.argv.slice(2);

function isTranscriptArtifact(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(value.sourceFiles) &&
    typeof value.text === "string"
  );
}

function isSummaryArtifact(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.schemaVersion === 1 &&
    typeof value.meeting === "object" &&
    value.meeting !== null &&
    typeof value.meeting.id === "string" &&
    typeof value.meeting.title === "string"
  );
}

async function hasCurrentPhotoDerivatives(meetingId, sourceLocation, photoFiles, directories) {
  if (photoFiles.length === 0 || sourceLocation === "artifacts-only") {
    return true;
  }

  const sourceDir =
    sourceLocation === "completed" ? directories.completedPhotoDir : directories.uploadPhotoDir;
  const sourceFiles = await Promise.all(
    photoFiles.map(async (fileName) => ({
      fileName,
      sha256: await sha256File(path.join(sourceDir, fileName)),
    })),
  );
  const manifest = await readJsonIfExists(directories.photoManifestPath);

  if (!isPhotoManifestArtifact(manifest) || !sourceFilesMatchManifest(manifest, sourceFiles)) {
    return false;
  }

  const outputFilesExist = await Promise.all(
    manifest.photos.map((photo) =>
      fileExists(path.join(directories.artifactPhotoDir, photo.outputFileName)),
    ),
  );

  return outputFilesExist.every(Boolean);
}

async function collectMeetingIds() {
  const uploadMeetingIds = await listMeetingIds(UPLOAD_ROOT);
  const completedMeetingIds = await listMeetingIds(COMPLETED_ROOT);
  const artifactMeetingIds = await listMeetingIds(ARTIFACT_ROOT);

  return [...new Set([...uploadMeetingIds, ...completedMeetingIds, ...artifactMeetingIds])].sort(
    (left, right) => left.localeCompare(right),
  );
}

async function getMeetingStatus(meetingId) {
  const directories = getMeetingDirectories(meetingId);
  const sourceLocation = (await fileExists(directories.uploadDir))
    ? "upload"
    : (await fileExists(directories.completedDir))
      ? "completed"
      : "artifacts-only";

  const audioFiles =
    sourceLocation === "completed"
      ? []
      : await listMeetingAudioFiles(meetingId);
  const photoFiles = await listMeetingPhotoFiles(meetingId);
  const transcript = await readJsonIfExists(directories.transcriptPath);
  const summary = await readJsonIfExists(directories.summaryPath);
  const hasTranscript = isTranscriptArtifact(transcript);
  const hasSummary = isSummaryArtifact(summary);
  const hasOptimizedPhotos = await hasCurrentPhotoDerivatives(
    meetingId,
    sourceLocation,
    photoFiles,
    directories,
  );

  const nextAction = !hasTranscript
    ? "transcribe"
    : !hasSummary
      ? "summarize"
      : photoFiles.length > 0 && !hasOptimizedPhotos
        ? "optimize-photos"
      : sourceLocation === "upload"
        ? "archive"
        : "done";

  return {
    meetingId,
    sourceLocation,
    audioCount: audioFiles.length,
    photoCount: photoFiles.length,
    hasTranscript,
    hasSummary,
    hasOptimizedPhotos,
    nextAction,
    photoManifestPath: directories.photoManifestPath,
    transcriptPath: directories.transcriptPath,
    summaryPath: directories.summaryPath,
    pagePath: `/meetings/${encodeURIComponent(meetingId)}`,
  };
}

async function main() {
  await ensurePipelineDirectories();

  const meetingIds =
    requestedMeetingIds.length > 0 ? requestedMeetingIds : await collectMeetingIds();

  if (meetingIds.length === 0) {
    console.log(JSON.stringify([], null, 2));
    return;
  }

  const statuses = await Promise.all(meetingIds.map((meetingId) => getMeetingStatus(meetingId)));
  console.log(JSON.stringify(statuses, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
