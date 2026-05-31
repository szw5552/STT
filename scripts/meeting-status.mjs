#!/usr/bin/env node

import {
  ARTIFACT_ROOT,
  COMPLETED_ROOT,
  UPLOAD_ROOT,
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  listMeetingAudioFiles,
  listMeetingIds,
  listMeetingPhotoFiles,
  readJsonIfExists,
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

  const nextAction = !hasTranscript
    ? "transcribe"
    : !hasSummary
      ? "summarize"
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
    nextAction,
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
