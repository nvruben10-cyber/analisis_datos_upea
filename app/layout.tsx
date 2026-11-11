import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IoT Control & Telemetría | Supabase",
  description: "Panel de control industrial y monitoreo de sensores IoT y actuadores con Next.js y Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

