import type { MeetingStatus } from "@/lib/meetings/schema";

const STATUS_LABELS: Record<MeetingStatus, string> = {
  archived: "已歸檔",
  "ready-to-archive": "可歸檔",
  "needs-photo-optimization": "待轉圖",
  "needs-summary": "待摘要",
  "needs-transcription": "待轉錄",
};

const STATUS_STYLES: Record<MeetingStatus, string> = {
  archived:
    "border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]",
  "ready-to-archive":
    "border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-ink)]",
  "needs-photo-optimization":
    "border-[color:var(--color-primary)] bg-white text-[color:var(--color-ink)]",
  "needs-summary":
    "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-ink)]",
  "needs-transcription":
    "border-[color:var(--color-line)] bg-white text-[color:var(--color-muted)]",
};

export function MeetingStatusChip({ status }: { status: MeetingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.18em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
