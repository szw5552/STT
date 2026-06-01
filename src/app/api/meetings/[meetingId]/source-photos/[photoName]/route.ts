import { getMeetingSourcePhoto } from "@/lib/meetings/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/meetings/[meetingId]/source-photos/[photoName]">,
) {
  const { meetingId: rawMeetingId, photoName: rawPhotoName } = await context.params;
  const meetingId = decodeURIComponent(rawMeetingId);
  const photoName = decodeURIComponent(rawPhotoName);
  const photo = await getMeetingSourcePhoto(meetingId, photoName);

  return new Response(new Uint8Array(photo.body), {
    headers: {
      "Cache-Control": photo.cacheControl,
      "Content-Type": photo.contentType,
    },
  });
}
