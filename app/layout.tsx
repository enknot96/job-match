import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "応募者AIランキング — TiDBハイブリッド検索 × AIマッチング",
    template: "%s | 応募者AIランキング",
  },
  description:
    "求人要件を入れるだけで、TiDB のベクトル検索（意味）と全文検索（キーワード）を RRF で融合し、応募者を「合う順」にランキング。Gemini が推薦理由も生成します。",
  applicationName: "応募者AIランキング",
  keywords: [
    "ハイブリッド検索",
    "ベクトル検索",
    "全文検索",
    "RRF",
    "TiDB",
    "Gemini",
    "AI採用",
    "Next.js",
  ],
  openGraph: {
    title: "応募者AIランキング — TiDBハイブリッド検索 × AIマッチング",
    description:
      "ベクトル検索（意味）× 全文検索（キーワード）を RRF で融合し、応募者を「合う順」にランキングするデモ。",
    siteName: "応募者AIランキング",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "応募者AIランキング — TiDBハイブリッド検索 × AIマッチング",
    description:
      "ベクトル検索（意味）× 全文検索（キーワード）を RRF で融合し、応募者を「合う順」にランキングするデモ。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} ${notoSansJP.variable}`}>
      <body>{children}</body>
    </html>
  );
}
