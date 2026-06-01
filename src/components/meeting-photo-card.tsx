"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { MeetingPhoto } from "@/lib/meetings/schema";

type MeetingPhotoCardProps = {
  photo: MeetingPhoto;
  alt: string;
  figureClassName: string;
  imageClassName: string;
  imageWidth: number;
  imageHeight: number;
};

export function MeetingPhotoCard({
  photo,
  alt,
  figureClassName,
  imageClassName,
  imageWidth,
  imageHeight,
}: MeetingPhotoCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const rawActionLabel =
    photo.originalUrl === photo.url ? "在新分頁開啟" : "下載原始檔";

  return (
    <>
      <figure className={figureClassName}>
        <button
          aria-haspopup="dialog"
          className="group relative block w-full cursor-zoom-in text-left"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <Image
            alt={alt}
            className={imageClassName}
            height={imageHeight}
            src={photo.url}
            unoptimized
            width={imageWidth}
          />
          <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-white opacity-90 transition group-hover:bg-black/75">
            查看大圖
          </span>
        </button>
      </figure>

      {isOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/88 p-4 md:p-6"
          onClick={() => setIsOpen(false)}
          role="dialog"
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex max-h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/60 shadow-2xl backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white md:px-5">
                <p className="truncate text-sm font-medium tracking-[0.08em] text-white/82">
                  {photo.fileName}
                </p>
                <div className="flex items-center gap-2">
                  <a
                    className="inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-white/35 hover:bg-white/10"
                    download={photo.fileName}
                    href={photo.originalUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {rawActionLabel}
                  </a>
                  <button
                    className="inline-flex min-h-11 items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    關閉
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center p-4 md:p-6">
                <Image
                  alt={alt}
                  className="h-auto max-h-full w-auto max-w-full rounded-[1.2rem] object-contain"
                  height={photo.height ?? imageHeight}
                  src={photo.url}
                  unoptimized
                  width={photo.width ?? imageWidth}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
