import type { Metadata } from "next";
import { Space_Grotesk, Source_Code_Pro } from "next/font/google";

import { AppSidebar } from "@/lib/components/app-sidebar";
import { getSessionUser } from "@/lib/server/auth";

import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = Source_Code_Pro({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Budget",
  description: "Personal envelope budgeting prototype",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {user ? (
          <div className="app-shell">
            <AppSidebar email={user.email} />
            <main className="app-content">{children}</main>
          </div>
        ) : (
          <main className="page-shell page-shell--public">{children}</main>
        )}
      </body>
    </html>
  );
}
