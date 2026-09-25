import type { Metadata } from "next";
import { Space_Grotesk, Source_Code_Pro } from "next/font/google";

import { AppSidebar } from "@/lib/components/app-sidebar";
import { prisma } from "@/lib/db";
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
  const accounts = user
    ? await prisma.account.findMany({
        where: { userId: user.id, archived: false },
        select: { id: true, name: true, type: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body suppressHydrationWarning>
        {user ? (
          <div className="app-shell">
            <AppSidebar email={user.email} accounts={accounts} />
            <main className="app-content">{children}</main>
          </div>
        ) : (
          <main className="page-shell page-shell--public">{children}</main>
        )}
      </body>
    </html>
  );
}
