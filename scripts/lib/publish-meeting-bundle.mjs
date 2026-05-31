import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  isPhotoManifestArtifact,
  readJsonIfExists,
} from "./meeting-paths.mjs";

async function copyIfExists(sourcePath, destinationPath) {
  if (!(await fileExists(sourcePath))) {
    return false;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return true;
}

async function publishPhotos(directories, manifest) {
  await fs.mkdir(directories.publishedPhotoDir, { recursive: true });

  for (const photo of manifest.photos) {
    const sourcePath = path.join(directories.artifactPhotoDir, photo.outputFileName);

    if (!(await fileExists(sourcePath))) {
      throw new Error(
        `artifacts/${directories.meetingId}/photos/${photo.outputFileName} 不存在，無法發布可部署照片。`,
      );
    }

    await fs.copyFile(sourcePath, path.join(directories.publishedPhotoDir, photo.outputFileName));
  }
}

export async function publishMeetingBundle(meetingId) {
  await ensurePipelineDirectories();

  const directories = getMeetingDirectories(meetingId);

  if (!(await fileExists(directories.summaryPath))) {
    throw new Error(
      `artifacts/${directories.meetingId}/summary.json 尚未存在，不能建立 deploy bundle。`,
    );
  }

  const manifest = await readJsonIfExists(directories.photoManifestPath);

  await fs.rm(directories.publishedDir, { recursive: true, force: true });
  await fs.mkdir(directories.publishedDir, { recursive: true });

  await copyIfExists(directories.summaryPath, directories.publishedSummaryPath);
  await copyIfExists(directories.transcriptPath, directories.publishedTranscriptPath);

  if (isPhotoManifestArtifact(manifest)) {
    await copyIfExists(directories.photoManifestPath, directories.publishedPhotoManifestPath);
    await publishPhotos(directories, manifest);
  }

  return directories;
}
