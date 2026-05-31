"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { archiveMeetingRawInput } from "@/lib/meetings/server";

export async function archiveMeetingAction(formData: FormData) {
  const meetingId = formData.get("meetingId");

  if (typeof meetingId !== "string" || meetingId.length === 0) {
    throw new Error("找不到要歸檔的 meetingId。");
  }

  await archiveMeetingRawInput(meetingId);
  const encodedMeetingId = encodeURIComponent(meetingId);
  revalidatePath("/");
  revalidatePath(`/meetings/${encodedMeetingId}`);
  redirect(`/meetings/${encodedMeetingId}`);
}
