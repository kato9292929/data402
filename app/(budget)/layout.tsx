import type { ReactNode } from "react";
import Link from "next/link";
import "./budget.css";

// budget pages (moved from x402-Interlock): the gate's timeline, tasks, inbox and approvals.
export default function BudgetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="budget">
      <header className="top">
        <Link href="/gate" className="brand">data402 budget</Link>
        <Link href="/tasks" className="muted">tasks</Link>
        <Link href="/inbox" className="muted">inbox</Link>
        <Link href="/" className="muted">census</Link>
        <span className="muted">task → rules → human → sign</span>
      </header>
      <main>{children}</main>
    </div>
  );
}
