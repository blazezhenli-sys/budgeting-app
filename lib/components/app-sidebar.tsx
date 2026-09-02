"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/lib/components/logout-button";

const primaryLinks = [
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
  { href: "/capture", label: "Capture" },
  { href: "/accounts", label: "Accounts" },
  { href: "/categories", label: "Categories" },
];

const secondaryLinks = [
  { href: "/import", label: "Import" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <Link href="/budget" className="app-brand-link">
          My Budget
        </Link>
        <p className="app-sidebar__tagline">Plan every dollar before it leaves the account.</p>
      </div>

      <nav className="app-sidebar__nav" aria-label="Primary">
        {primaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`app-nav-link${isActivePath(pathname, link.href) ? " app-nav-link--active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <nav className="app-sidebar__nav app-sidebar__nav--secondary" aria-label="Secondary">
        {secondaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`app-nav-link${isActivePath(pathname, link.href) ? " app-nav-link--active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__user">
          <span className="muted">Signed in</span>
          <strong>{email}</strong>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
