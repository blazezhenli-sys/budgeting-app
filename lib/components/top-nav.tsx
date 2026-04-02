import Link from "next/link";

import { LogoutButton } from "@/lib/components/logout-button";

export function TopNav({ email }: { email: string }) {
  return (
    <header className="top-nav">
      <div className="top-nav__left">
        <Link href="/budget" className="brand-link">
          My Budget
        </Link>
        <nav className="top-nav__links">
          <Link href="/budget">Budget</Link>
          <Link href="/transactions">Transactions</Link>
          <Link href="/capture">Capture</Link>
          <Link href="/accounts">Accounts</Link>
          <Link href="/categories">Categories</Link>
          <Link href="/import">Import</Link>
          <Link href="/reports">Reports</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </div>
      <div className="top-nav__right">
        <span className="muted">{email}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
