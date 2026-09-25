import Link from "next/link";

import { LogoutButton } from "@/lib/components/logout-button";

type SidebarAccount = {
  id: string;
  name: string;
  type: "CASH" | "CHECKING" | "SAVINGS";
};

const primaryLinks = [
  { href: "/budget", label: "Budget" },
  { href: "/reports", label: "Reports" },
  { href: "/transactions", label: "All Accounts" },
];

const secondaryLinks = [
  { href: "/capture", label: "Capture" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar({ email, accounts }: { email: string; accounts: SidebarAccount[] }) {
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
          <Link key={link.href} href={link.href} className="app-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="app-sidebar__accounts">
        <div className="app-sidebar__section-label">Accounts</div>
        <nav className="app-sidebar__account-list" aria-label="Accounts">
          {accounts.map((account) => (
            <Link key={account.id} href={`/accounts/${account.id}`} className="app-account-link">
              <span>{account.name}</span>
              <span className="app-account-link__meta">{account.type}</span>
            </Link>
          ))}
        </nav>
      </div>

      <nav className="app-sidebar__nav app-sidebar__nav--secondary" aria-label="Secondary">
        {secondaryLinks.map((link) => (
          <Link key={link.href} href={link.href} className="app-nav-link">
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
