import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-20 lg:px-10">
      <p className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-primary)]">
        找不到這場會議
      </p>
      <h1 className="max-w-[12ch] font-serif text-[clamp(2.8rem,8vw,4.5rem)] leading-[0.96] tracking-[-0.03em]">
        這一頁還沒有可讀的素材。
      </h1>
      <p className="max-w-[62ch] text-base leading-8 text-[color:var(--color-muted)]">
        請先確認 meeting id、`artifacts/&lt;meeting-id&gt;/summary.json` 是否存在，
        或回到首頁查看目前有哪些會議已經整理完成。
      </p>
      <div>
        <Link
          className="inline-flex min-h-11 items-center rounded-full bg-[color:var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-[var(--shadow-soft)] hover:-translate-y-0.5"
          href="/"
        >
          回到首頁
        </Link>
      </div>
    </main>
  );
}
