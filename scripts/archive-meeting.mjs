#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { promises as fs } from "node:fs";
import {
  COMPLETED_ROOT,
  ROOT_DIR,
  ensurePipelineDirectories,
  fileExists,
  getMeetingDirectories,
  listMeetingIds,
} from "./lib/meeting-paths.mjs";

loadEnvConfig(ROOT_DIR);

const requestedMeetingIds = process.argv.slice(2);

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
