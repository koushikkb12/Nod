import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Nod: the job agent that waits for your nod", template: "%s · Nod" },
  description:
    "Nod finds jobs that fit your CV and preferences, drafts applications using only facts you've confirmed, and sends nothing without your explicit approval.",
};

export const viewport: Viewport = {
  themeColor: "#f6f4ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-ink)",
              color: "var(--color-paper)",
              border: "none",
              borderRadius: "12px",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}
