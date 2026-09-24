import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./product-ui.css";

// Use local font files to avoid network dependency during build.
// Geist fonts are cached in .vinext/fonts/ from previous builds.
const geistSans = localFont({
  src: [
    { path: "../public/fonts/geist-sans.woff2", weight: "100 900" },
  ],
  variable: "--font-geist-sans",
  fallback: ["system-ui", "sans-serif"],
});

const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono.woff2", weight: "100 900" },
  ],
  variable: "--font-geist-mono",
  fallback: ["monospace"],
});

export const metadata: Metadata = {
  title: "Papery 阅读器",
  description: "轻盈、自由的 TXT、EPUB 与 PDF 阅读器。",
  /* viewport is exported separately. */
  /* {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  }, */
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};
