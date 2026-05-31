import { getMeetingPhoto } from "@/lib/meetings/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/meetings/[meetingId]/photos/[photoName]">,
) {
  const { meetingId, photoName } = await context.params;
  const photo = await getMeetingPhoto(meetingId, photoName);

  return new Response(new Uint8Array(photo.body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": photo.contentType,
    },
  });
}
