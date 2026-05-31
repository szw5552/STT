import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const serif = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  display: "swap",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "會議生活誌",
    template: "%s | 會議生活誌",
  },
  description: "把會議錄音、照片與摘要編成一頁可翻讀的日系生活誌。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
