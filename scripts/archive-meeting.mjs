#!/usr/bin/env node

import nextEnv from "@next/env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  COMPLETED_ROOT,
  ROOT_DIR,
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  isPhotoManifestArtifact,
  listMeetingIds,
  listMeetingPhotoFiles,
  readJsonIfExists,
  sha256File,
  sourceFilesMatchManifest,
} from "./lib/meeting-paths.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(ROOT_DIR);

const requestedMeetingIds = process.argv.slice(2);

async function ensurePhotoDerivativesReady(meetingId, directories) {
  const photoFiles = await listMeetingPhotoFiles(meetingId);

  if (photoFiles.length === 0) {
    return;
  }

  const sourceFiles = await Promise.all(
    photoFiles.map(async (fileName) => ({
      fileName,
      sha256: await sha256File(path.join(directories.uploadPhotoDir, fileName)),
    })),
  );
  const manifest = await readJsonIfExists(directories.photoManifestPath);

  if (!isPhotoManifestArtifact(manifest) || !sourceFilesMatchManifest(manifest, sourceFiles)) {
    throw new Error(
      `artifacts/${meetingId}/photo-manifest.json 尚未對應目前照片，請先執行 npm run optimize-photos -- ${meetingId}。`,
    );
  }

  const derivedFilesExist = await Promise.all(
    manifest.photos.map((photo) =>
      fileExists(path.join(directories.artifactPhotoDir, photo.outputFileName)),
    ),
  );

  if (!derivedFilesExist.every(Boolean)) {
    throw new Error(
      `artifacts/${meetingId}/photos 內的 webp 衍生檔不完整，請先重新執行 npm run optimize-photos -- ${meetingId}。`,
    );
  }
}

async function archiveMeeting(meetingId) {
  const directories = getMeetingDirectories(meetingId);

  if (!(await fileExists(directories.summaryPath))) {
    throw new Error(
      `artifacts/${meetingId}/summary.json 尚未存在，請先完成摘要 skill 再歸檔。`,
    );
  }

  if (!(await fileExists(directories.uploadDir))) {
    console.log(`- ${meetingId}: upload 內已無原始素材，略過。`);
    return;
  }

  if (await fileExists(directories.completedDir)) {
    throw new Error(`completed/${meetingId} 已存在，請先確認是否重複歸檔。`);
  }

  await ensurePhotoDerivativesReady(meetingId, directories);
  await fs.mkdir(COMPLETED_ROOT, { recursive: true });
  await fs.rename(directories.uploadDir, directories.completedDir);
  console.log(`- ${meetingId}: 已移到 completed/${meetingId}`);
}

async function main() {
  await ensurePipelineDirectories();

  const meetingIds =
    requestedMeetingIds.length > 0
      ? requestedMeetingIds
      : await listMeetingIds();

  if (meetingIds.length === 0) {
    console.log("upload/ 目前沒有可歸檔的會議資料夾。");
    return;
  }

  console.log(`開始歸檔 ${meetingIds.length} 場會議的原始素材...`);

  for (const meetingId of meetingIds) {
    await archiveMeeting(meetingId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
