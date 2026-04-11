import type { Metadata } from "next";
import Script from "next/script";
import { CHUNK_LOAD_RECOVERY_INLINE } from "@/lib/chunk-load-recovery-inline";
import "./globals.css";

export const metadata: Metadata = {
  title: "PMG — Dashboard",
  description: "Dashboards PMG por setor (Hub Group.id) e PostgreSQL analítico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <Script id="pmg-chunk-load-recovery" strategy="beforeInteractive">
          {CHUNK_LOAD_RECOVERY_INLINE}
        </Script>
        {children}
      </body>
    </html>
  );
}
