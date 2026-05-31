#!/usr/bin/env node

import nextEnv from "@next/env";
import { ROOT_DIR, ensurePipelineDirectories, listMeetingIds } from "./lib/meeting-paths.mjs";
import { publishMeetingBundle } from "./lib/publish-meeting-bundle.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(ROOT_DIR);

const requestedMeetingIds = process.argv.slice(2);

async function main() {
  await ensurePipelineDirectories();

  const meetingIds = requestedMeetingIds.length > 0 ? requestedMeetingIds : await listMeetingIds();

  if (meetingIds.length === 0) {
    console.log("目前沒有可發布到 published/ 的會議資料夾。");
    return;
  }

  console.log(`開始建立 ${meetingIds.length} 場會議的 deploy bundle...`);

  for (const meetingId of meetingIds) {
    await publishMeetingBundle(meetingId);
    console.log(`- ${meetingId}: 已寫入 published/${meetingId}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
