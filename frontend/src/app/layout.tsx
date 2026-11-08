import type { Metadata, Viewport } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import "./globals.css";

// Self-hosted at build time, so the campus deployment needs no internet connection.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin", "latin-ext"], display: "swap" });
// Display face for the ExamHub brand name (sign-in page).
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin", "latin-ext"], weight: ["600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ExamHub · Online Examination Platform", template: "%s · ExamHub" },
  description: "Fair, secure university examinations on the campus network.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfdfb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="so" className={`${jakarta.variable} ${playfair.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme and language before the first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
