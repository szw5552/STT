import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveMeetingAction } from "@/app/actions";
import { MeetingStatusChip } from "@/components/meeting-status-chip";
import { getMeetingDetail } from "@/lib/meetings/server";

export const dynamic = "force-dynamic";

function decodeRouteParam(value: string) {
  return decodeURIComponent(value);
}

function formatDateLabel(value?: string) {
  if (!value) {
    return "未提供";
  }

  try {
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatSourceLocationLabel(sourceLocation: "upload" | "completed" | "published") {
  return sourceLocation === "upload"
    ? "upload/"
    : sourceLocation === "published"
      ? "published/"
      : "completed/";
}

export async function generateMetadata(
  props: {
    params: Promise<{ meetingId: string }>;
  },
): Promise<Metadata> {
  const { meetingId: rawMeetingId } = await props.params;
  const meetingId = decodeRouteParam(rawMeetingId);

  try {
    const meeting = await getMeetingDetail(meetingId);

    return {
      title: meeting.summary?.meeting.title ?? meeting.title,
      description:
        meeting.summary?.hero.dek ??
        "會議摘要尚未完成，這一頁會在逐字稿與照片整理好後自動更新。",
    };
  } catch {
    return {
      title: "找不到會議",
    };
  }
}

export default async function MeetingPage(props: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId: rawMeetingId } = await props.params;
  const meetingId = decodeRouteParam(rawMeetingId);

  let meeting;

  try {
    meeting = await getMeetingDetail(meetingId);
  } catch {
    notFound();
  }

  const summary = meeting.summary;
  const transcriptPreview = meeting.transcript?.text
    .split(/\n+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .slice(0, 280);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-14 px-6 py-8 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--color-line)] pb-5">
        <Link
          className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--color-line)] px-5 py-3 text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-soft)]"
          href="/"
        >
          回到會議索引
        </Link>
        <MeetingStatusChip status={meeting.status} />
      </div>

      <section className="grid gap-8 lg:grid-cols-[1fr_0.95fr] lg:items-end">
        <div className="space-y-6">
          <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
            {summary?.hero.kicker ?? "整理中的會議"}
          </p>
          <h1 className="max-w-[11ch] font-serif text-[clamp(3rem,7vw,5.3rem)] leading-[0.95] tracking-[-0.03em]">
            {summary?.hero.headline ?? meeting.title}
          </h1>
          <p className="max-w-[60ch] text-lg leading-8 text-[color:var(--color-muted)]">
            {summary?.hero.dek ??
              "這場會議還在編輯中。Groq 逐字稿、webp 照片與版面都已經排好位子，等 summary.json 寫完就會長成完整頁面。"}
          </p>
          <div className="grid gap-4 text-sm text-[color:var(--color-muted)] md:grid-cols-3">
            <div className="border-t border-[color:var(--color-line)] pt-3">
              <p className="font-semibold text-[color:var(--color-ink)]">更新時間</p>
              <p className="mt-2">{formatDateLabel(meeting.updatedAt)}</p>
            </div>
            <div className="border-t border-[color:var(--color-line)] pt-3">
              <p className="font-semibold text-[color:var(--color-ink)]">照片數量</p>
              <p className="mt-2">{meeting.photoCount} 張</p>
            </div>
            <div className="border-t border-[color:var(--color-line)] pt-3">
              <p className="font-semibold text-[color:var(--color-ink)]">素材位置</p>
              <p className="mt-2">{formatSourceLocationLabel(meeting.sourceLocation)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
          {meeting.photos[0] ? (
            <figure className="overflow-hidden rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
              <Image
                alt={`${meeting.title} 的主照片`}
                className="h-full min-h-[440px] w-full object-cover"
                src={meeting.photos[0].url}
                unoptimized
                width={1600}
                height={1200}
              />
            </figure>
          ) : (
            <div className="flex min-h-[440px] items-end rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-primary-soft)] p-8">
              <p className="max-w-[14ch] font-serif text-3xl leading-[1.05] text-[color:var(--color-ink)]">
                這場會議還沒有照片，先讓文字站到前排。
              </p>
            </div>
          )}

          <div className="grid gap-4">
            {meeting.photos.slice(1, 3).map((photo) => (
              <figure
                className="overflow-hidden rounded-[1.6rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
                key={photo.fileName}
              >
                <Image
                  alt={`${meeting.title} 的會議照片 ${photo.fileName}`}
                  className="h-52 w-full object-cover"
                  src={photo.url}
                  unoptimized
                  width={1200}
                  height={900}
                />
              </figure>
            ))}

            {!meeting.photos[1] && (
              <div className="rounded-[1.6rem] border border-[color:var(--color-line)] bg-white p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                  版面提醒
                </p>
                <p className="mt-3 text-base leading-8 text-[color:var(--color-muted)]">
                  想讓這頁更像一本雜誌，可以再補 1 到 3 張會議現場照，版面會自動拉出更完整的留白節奏。
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[0.72fr_0.28fr]">
        <div className="space-y-12">
          {summary ? (
            <>
              {summary.agenda.length > 0 && (
                <section className="space-y-5 border-t border-[color:var(--color-line)] pt-6">
                  <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                    議程
                  </p>
                  <div className="grid gap-3">
                    {summary.agenda.map((item) => (
                      <p
                        className="max-w-[65ch] border-b border-[color:var(--color-line)] pb-3 text-lg leading-8"
                        key={item}
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {summary.highlights.length > 0 && (
                <section className="space-y-6 border-t border-[color:var(--color-line)] pt-6">
                  <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                    現場摘要
                  </p>
                  <div className="space-y-8">
                    {summary.highlights.map((highlight) => (
                      <article
                        className="grid gap-3 md:grid-cols-[0.35fr_0.65fr]"
                        key={`${highlight.title}-${highlight.body}`}
                      >
                        <h2 className="font-serif text-2xl leading-[1.08] tracking-[-0.03em]">
                          {highlight.title}
                        </h2>
                        <p className="max-w-[60ch] text-base leading-8 text-[color:var(--color-muted)]">
                          {highlight.body}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="grid gap-8 border-t border-[color:var(--color-line)] pt-6 md:grid-cols-2">
                <div className="space-y-4">
                  <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                    決議
                  </p>
                  <div className="space-y-3">
                    {summary.decisions.length > 0 ? (
                      summary.decisions.map((decision) => (
                        <p
                          className="rounded-[1.2rem] border border-[color:var(--color-line)] bg-white px-4 py-4 text-sm leading-7 text-[color:var(--color-ink)]"
                          key={decision}
                        >
                          {decision}
                        </p>
                      ))
                    ) : (
                      <p className="text-sm leading-7 text-[color:var(--color-muted)]">
                        目前摘要沒有列出明確決議。
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                    待辦
                  </p>
                  <div className="space-y-3">
                    {summary.actionItems.length > 0 ? (
                      summary.actionItems.map((item) => (
                        <article
                          className="rounded-[1.2rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-4"
                          key={`${item.owner}-${item.task}`}
                        >
                          <p className="text-sm font-semibold text-[color:var(--color-ink)]">
                            {item.owner}
                          </p>
                          <p className="mt-1 text-sm leading-7 text-[color:var(--color-muted)]">
                            {item.task}
                          </p>
                          {item.due ? (
                            <p className="mt-2 text-xs font-semibold tracking-[0.14em] text-[color:var(--color-accent)]">
                              截止 {item.due}
                            </p>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="text-sm leading-7 text-[color:var(--color-muted)]">
                        目前摘要沒有列出待辦。
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {summary.quotes.length > 0 && (
                <section className="space-y-5 border-t border-[color:var(--color-line)] pt-6">
                  <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                    會議原話
                  </p>
                  <div className="grid gap-4">
                    {summary.quotes.slice(0, 2).map((quote) => (
                      <blockquote
                        className="border-l-0 rounded-[1.5rem] bg-[color:var(--color-accent-soft)] px-6 py-6 font-serif text-2xl leading-[1.4] text-[color:var(--color-ink)]"
                        key={quote}
                      >
                        「{quote}」
                      </blockquote>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-5 border-t border-[color:var(--color-line)] pt-6">
                <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                  收尾
                </p>
                <p className="max-w-[62ch] text-base leading-8 text-[color:var(--color-muted)]">
                  {summary.closingNote}
                </p>
              </section>
            </>
          ) : (
            <section className="space-y-5 rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-8">
              <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                摘要還沒完成
              </p>
              <h2 className="max-w-[12ch] font-serif text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-[-0.03em]">
                逐字稿已經在位，只差最後一手編輯。
              </h2>
              <p className="max-w-[62ch] text-base leading-8 text-[color:var(--color-muted)]">
                請直接用 `meeting-pipeline` skill 接手這場會議，它會依目前狀態續跑，
                讀取 `{meeting.transcriptPath}`，寫出 `{meeting.summaryPath}`，補齊 webp 照片後再完成歸檔。
              </p>
              {transcriptPreview ? (
                <p className="max-w-[62ch] border-t border-[color:var(--color-line)] pt-5 text-base leading-8 text-[color:var(--color-muted)]">
                  {transcriptPreview}...
                </p>
              ) : null}
            </section>
          )}

          {meeting.photos.length > 3 ? (
            <section className="space-y-5 border-t border-[color:var(--color-line)] pt-6">
              <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                補充照片
              </p>
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr_0.9fr]">
                {meeting.photos.slice(3, 6).map((photo, index) => (
                  <figure
                    className={`overflow-hidden rounded-[1.5rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] ${
                      index === 0 ? "md:row-span-2" : ""
                    }`}
                    key={photo.fileName}
                  >
                    <Image
                      alt={`${meeting.title} 的補充照片 ${photo.fileName}`}
                      className={`w-full object-cover ${index === 0 ? "h-full min-h-[420px]" : "h-52"}`}
                      src={photo.url}
                      unoptimized
                      width={1200}
                      height={900}
                    />
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <section className="rounded-[1.6rem] border border-[color:var(--color-line)] bg-white p-6">
            <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
              參與者
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {summary?.attendees.length ? (
                summary.attendees.map((attendee) => (
                  <span
                    className="rounded-full border border-[color:var(--color-line)] px-4 py-2 text-sm text-[color:var(--color-ink)]"
                    key={attendee}
                  >
                    {attendee}
                  </span>
                ))
              ) : (
                <p className="text-sm leading-7 text-[color:var(--color-muted)]">
                  尚未在摘要內標出參與者。
                </p>
              )}
            </div>
          </section>

          {meeting.status === "ready-to-archive" ? (
            <form action={archiveMeetingAction}>
              <input name="meetingId" type="hidden" value={meeting.id} />
              <button
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:-translate-y-0.5"
                type="submit"
              >
                把原始素材移到 completed
              </button>
            </form>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
