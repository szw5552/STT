#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  buildPhotoOutputFileName,
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  guessMimeType,
  isPhotoManifestArtifact,
  listMeetingIds,
  listMeetingPhotoFiles,
  readJsonIfExists,
  sha256File,
  sourceFilesMatchManifest,
  writeJson,
} from "./lib/meeting-paths.mjs";

const requestedMeetingIds = process.argv.slice(2);
const execFileAsync = promisify(execFile);

async function buildSourcePhotoFiles(meetingId) {
  const directories = getMeetingDirectories(meetingId);
  const sourceLocation = (await fileExists(directories.uploadDir)) ? "upload" : "completed";
  const sourceDir =
    sourceLocation === "upload" ? directories.uploadPhotoDir : directories.completedPhotoDir;
  const photoFiles = await listMeetingPhotoFiles(meetingId);

  const sourceFiles = await Promise.all(
    photoFiles.map(async (fileName) => {
      const filePath = path.join(sourceDir, fileName);
      const stats = await fs.stat(filePath);

      return {
        fileName,
        filePath,
        mimeType: guessMimeType(fileName),
        sizeBytes: stats.size,
        sha256: await sha256File(filePath),
      };
    }),
  );

  return { sourceFiles, sourceLocation };
}

async function hasCurrentOptimizedPhotos(directories, sourceFiles) {
  const existing = await readJsonIfExists(directories.photoManifestPath);

  if (!isPhotoManifestArtifact(existing) || !sourceFilesMatchManifest(existing, sourceFiles)) {
    return false;
  }

  const derivedFilesExist = await Promise.all(
    existing.photos.map((photo) =>
      fileExists(path.join(directories.artifactPhotoDir, photo.outputFileName)),
    ),
  );

  return derivedFilesExist.every(Boolean);
}

async function writeWebp(sourcePath, outputPath) {
  return sharp(sourcePath).rotate().webp({ quality: 82 }).toFile(outputPath);
}

async function writeWebpFromHeicViaSips(sourcePath, outputPath) {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "stt-heic-"));
  const tempPngPath = path.join(tempDir, `${path.parse(sourcePath).name}.png`);

  try {
    await execFileAsync("sips", ["-s", "format", "png", sourcePath, "--out", tempPngPath]);
    return await writeWebp(tempPngPath, outputPath);
  } catch (error) {
    const stderr =
      error !== null && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(`HEIC 備援轉檔失敗：${reason}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeWebpFromHeicViaFfmpeg(sourcePath, outputPath) {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), "stt-heic-"));
  const tempPngPath = path.join(tempDir, `${path.parse(sourcePath).name}.png`);

  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-update",
      "1",
      tempPngPath,
    ]);
    return await writeWebp(tempPngPath, outputPath);
  } catch (error) {
    const stderr =
      error !== null &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    const reason = stderr || (error instanceof Error ? error.message : String(error));
    throw new Error(`HEIC ffmpeg 備援轉檔失敗：${reason}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeWebpFromHeic(sourcePath, outputPath) {
  try {
    return await writeWebpFromHeicViaSips(sourcePath, outputPath);
  } catch (sipsError) {
    try {
      return await writeWebpFromHeicViaFfmpeg(sourcePath, outputPath);
    } catch (ffmpegError) {
      const sipsReason = sipsError instanceof Error ? sipsError.message : String(sipsError);
      const ffmpegReason =
        ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError);
      throw new Error(`${sipsReason}; ${ffmpegReason}`);
    }
  }
}

async function optimizeMeetingPhotos(meetingId) {
  const directories = getMeetingDirectories(meetingId);
  const { sourceFiles, sourceLocation } = await buildSourcePhotoFiles(meetingId);

  if (sourceFiles.length === 0) {
    console.log(`- ${meetingId}: 找不到可轉成 webp 的照片，略過。`);
    return;
  }

  if (await hasCurrentOptimizedPhotos(directories, sourceFiles)) {
    console.log(`- ${meetingId}: 照片未變更，沿用既有 webp 衍生檔。`);
    return;
  }

  await fs.rm(directories.artifactPhotoDir, { recursive: true, force: true });
  await fs.mkdir(directories.artifactPhotoDir, { recursive: true });

  const photos = [];

  for (const sourceFile of sourceFiles) {
    const outputFileName = buildPhotoOutputFileName(sourceFile.fileName, sourceFile.sha256);
    const outputPath = path.join(directories.artifactPhotoDir, outputFileName);

    try {
      let result;

      try {
        result = await writeWebp(sourceFile.filePath, outputPath);
      } catch (error) {
        if (path.extname(sourceFile.filePath).toLowerCase() !== ".heic") {
          throw error;
        }

        result = await writeWebpFromHeic(sourceFile.filePath, outputPath);
      }

      if (typeof result.width !== "number" || typeof result.height !== "number") {
        throw new Error("轉檔完成，但未取得輸出尺寸。");
      }

      photos.push({
        sourceFileName: sourceFile.fileName,
        outputFileName,
        sha256: sourceFile.sha256,
        sourceMimeType: sourceFile.mimeType,
        width: result.width,
        height: result.height,
        sizeBytes: result.size,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `無法把 ${path.relative(process.cwd(), sourceFile.filePath)} 轉成 webp：${reason}`,
      );
    }
  }

  await writeJson(directories.photoManifestPath, {
    schemaVersion: 1,
    meetingId,
    createdAt: new Date().toISOString(),
    sourceLocation,
    sourceFiles: sourceFiles.map(({ fileName, sha256 }) => ({ fileName, sha256 })),
    photos,
  });

  console.log(`- ${meetingId}: 已寫入 artifacts/${meetingId}/photos/*.webp`);
}

async function main() {
  await ensurePipelineDirectories();

  const meetingIds =
    requestedMeetingIds.length > 0 ? requestedMeetingIds : await listMeetingIds();

  if (meetingIds.length === 0) {
    console.log("upload/ 目前沒有待處理的會議照片。");
    return;
  }

  console.log(`開始優化 ${meetingIds.length} 場會議的照片...`);

  for (const meetingId of meetingIds) {
    await optimizeMeetingPhotos(meetingId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
