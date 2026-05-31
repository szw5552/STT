import Image from "next/image";
import Link from "next/link";
import { MeetingStatusChip } from "@/components/meeting-status-chip";
import { listMeetings } from "@/lib/meetings/server";

export const dynamic = "force-dynamic";

function formatDateLabel(value?: string) {
  if (!value) {
    return "尚未寫入日期";
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

export default async function Home() {
  const meetings = await listMeetings();
  const featuredMeeting = meetings.find((meeting) => meeting.hasSummary) ?? meetings[0] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-20 px-6 py-8 lg:px-10 lg:py-10">
      <section className="grid gap-10 border-b border-[color:var(--color-line)] pb-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <p className="text-sm font-semibold tracking-[0.22em] text-[color:var(--color-primary)]">
            MEETING MAGAZINE
          </p>
          <h1 className="max-w-[11ch] font-serif text-[clamp(3.3rem,8vw,5.4rem)] leading-[0.95] tracking-[-0.03em]">
            把一次會議，收成一頁好翻的紀錄。
          </h1>
          <p className="max-w-[62ch] text-lg leading-8 text-[color:var(--color-muted)]">
            這個工作台會讀取 `upload/`、`artifacts/` 與 `completed/`
            的實際檔案狀態。現在可以直接用 `meeting-pipeline` skill
            接手整條流程，從 Groq 轉錄、zh-TW 摘要、照片轉成 webp 到歸檔都沿著同一個入口往下跑。
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full border border-[color:var(--color-line)] px-4 py-2 text-sm text-[color:var(--color-muted)]">
              目前會議數 {meetings.length}
            </span>
            <span className="rounded-full border border-[color:var(--color-line)] px-4 py-2 text-sm text-[color:var(--color-muted)]">
              已完成摘要 {meetings.filter((meeting) => meeting.hasSummary).length}
            </span>
            <span className="rounded-full border border-[color:var(--color-line)] px-4 py-2 text-sm text-[color:var(--color-muted)]">
              待轉錄 {meetings.filter((meeting) => meeting.status === "needs-transcription").length}
            </span>
          </div>
        </div>

        <aside className="flex flex-col justify-between gap-8 rounded-[1.5rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-soft)]">
          <div className="space-y-4">
            <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
              目前流程
            </p>
            <ol className="space-y-4 text-sm leading-7 text-[color:var(--color-muted)]">
              <li>
                1. 把單場會議放到 `upload/&lt;meeting-id&gt;/audio` 與 `photos`
              </li>
              <li>2. 用 `meeting-pipeline` skill 處理 `&lt;meeting-id&gt;`</li>
              <li>
                3. skill 會依狀態自動續跑轉錄、摘要、照片轉檔與歸檔，頁面完成後直接到
                `/meetings/&lt;meeting-id&gt;`
              </li>
            </ol>
          </div>

          <div className="space-y-3 border-t border-[color:var(--color-line)] pt-5 text-sm leading-7 text-[color:var(--color-muted)]">
            <p className="font-semibold text-[color:var(--color-ink)]">資料夾契約</p>
            <p>`upload/` 放原始素材，`artifacts/` 放 transcript、summary 與 webp 衍生圖，`completed/` 放歸檔後的音檔與照片。</p>
          </div>
        </aside>
      </section>

      {featuredMeeting ? (
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="space-y-5">
            <MeetingStatusChip status={featuredMeeting.status} />
            <div className="space-y-3">
              <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                {featuredMeeting.kicker ?? "本期會議"}
              </p>
              <h2 className="max-w-[12ch] font-serif text-[clamp(2.6rem,6vw,4.4rem)] leading-[0.98] tracking-[-0.03em]">
                {featuredMeeting.headline ?? featuredMeeting.title}
              </h2>
            </div>
            <p className="max-w-[58ch] text-base leading-8 text-[color:var(--color-muted)]">
              {featuredMeeting.dek ??
                "整理好的摘要與 webp 照片衍生檔會留在 artifacts，原始素材則留在 upload 或 completed，讓這一頁永遠只負責閱讀與編排。"}
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-[color:var(--color-muted)]">
              <span>{featuredMeeting.audioCount} 段錄音</span>
              <span>{featuredMeeting.photoCount} 張照片</span>
              <span>{formatDateLabel(featuredMeeting.updatedAt)}</span>
            </div>
            <Link
              className="inline-flex min-h-11 items-center rounded-full bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:-translate-y-0.5"
              href={`/meetings/${featuredMeeting.id}`}
            >
              翻開這場會議
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            {featuredMeeting.coverPhotoUrl ? (
              <Link
                className="group overflow-hidden rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
                href={`/meetings/${featuredMeeting.id}`}
              >
                <Image
                  alt={`${featuredMeeting.title} 的會議照片`}
                  className="h-full min-h-[420px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  src={featuredMeeting.coverPhotoUrl}
                  unoptimized
                  width={1600}
                  height={1200}
                />
              </Link>
            ) : (
              <div className="flex min-h-[420px] items-end rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-primary-soft)] p-8">
                <p className="max-w-[16ch] font-serif text-3xl leading-[1.05] text-[color:var(--color-ink)]">
                  這場會議還沒有照片，版面會先保留留白。
                </p>
              </div>
            )}

            <div className="flex flex-col justify-between gap-4">
              <div className="rounded-[1.6rem] border border-[color:var(--color-line)] bg-white p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
                  下一步
                </p>
                <p className="mt-3 text-base leading-8 text-[color:var(--color-muted)]">
                  {featuredMeeting.hasTranscript
                    ? featuredMeeting.hasSummary
                      ? featuredMeeting.hasOptimizedPhotos
                        ? "摘要與照片都已就位，現在只差讓 meeting-pipeline skill 完成最後的歸檔。"
                        : "摘要已到位，接下來讓 meeting-pipeline skill 把所有照片轉成 webp 並接回頁面。"
                      : "逐字稿已準備好，現在可以用 meeting-pipeline skill 接手寫出 zh-TW 摘要。"
                    : "素材已進 upload，接下來直接交給 meeting-pipeline skill。"}
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
                <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                  檔案位置
                </p>
                <p className="mt-3 text-base leading-8 text-[color:var(--color-muted)]">
                  `upload/{featuredMeeting.id}` 進來，`artifacts/{featuredMeeting.id}` 長出摘要與 webp，
                  最後 `completed/{featuredMeeting.id}` 留住原始照片與錄音。
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-8 rounded-[2rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-8 lg:grid-cols-[1fr_0.75fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
              還沒有會議素材
            </p>
            <h2 className="max-w-[12ch] font-serif text-[clamp(2.4rem,6vw,4rem)] leading-[0.98] tracking-[-0.03em]">
              先把第一場會議放進 upload。
            </h2>
            <p className="max-w-[60ch] text-base leading-8 text-[color:var(--color-muted)]">
              建議先建立 `upload/2026-06-team-sync/audio` 與 `photos`
              兩個子資料夾，素材放好後直接交給 `meeting-pipeline` skill。
            </p>
          </div>
          <div className="space-y-3 text-sm leading-7 text-[color:var(--color-muted)]">
            <p className="font-semibold text-[color:var(--color-ink)]">推薦順序</p>
            <p>1. 建立 meeting-id 子資料夾</p>
            <p>2. 放入錄音與照片</p>
            <p>3. 用 `meeting-pipeline` skill 跑這場會議</p>
            <p>4. 完成後到 `/meetings/&lt;meeting-id&gt;` 查看頁面</p>
          </div>
        </section>
      )}

      <section className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
        <div className="space-y-4">
          <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent)]">
            會議索引
          </p>
          <h2 className="max-w-[11ch] font-serif text-[clamp(2.2rem,5vw,3.6rem)] leading-[1] tracking-[-0.03em]">
            現在有哪些頁面，還差哪一步。
          </h2>
          <p className="max-w-[55ch] text-base leading-8 text-[color:var(--color-muted)]">
            狀態是從檔案系統直接算出來的，所以只要 transcript、summary 或原始素材移動，這裡就會跟著更新。
          </p>
        </div>

        <div className="space-y-6">
          {meetings.length === 0 ? null : (
            meetings.map((meeting) => (
              <article
                className="grid gap-5 border-t border-[color:var(--color-line)] pt-6 md:grid-cols-[0.9fr_1.1fr]"
                key={meeting.id}
              >
                <div className="space-y-3">
                  <MeetingStatusChip status={meeting.status} />
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
                      {meeting.id}
                    </p>
                    <h3 className="font-serif text-3xl leading-[1.04] tracking-[-0.03em]">
                      {meeting.headline ?? meeting.title}
                    </h3>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-3">
                    <p className="max-w-[58ch] text-base leading-8 text-[color:var(--color-muted)]">
                      {meeting.dek ??
                       "這場會議還在整理途中，等 transcript、summary 與 webp 照片都補齊後，就能讀成完整的一頁生活誌。"}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm text-[color:var(--color-muted)]">
                      <span>{meeting.audioCount} 段錄音</span>
                      <span>{meeting.photoCount} 張照片</span>
                      <span>{meeting.sourceLocation === "upload" ? "仍在 upload" : "已移到 completed"}</span>
                    </div>
                  </div>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--color-line)] px-5 py-3 text-sm font-semibold text-[color:var(--color-ink)] hover:border-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-soft)]"
                    href={`/meetings/${meeting.id}`}
                  >
                    查看內容
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
