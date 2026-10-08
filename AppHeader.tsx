"use client";

import { DoorOpen, Footprints, Inbox, LogOut, ScrollText, Wrench, type LucideIcon } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { scopeLabel } from "@/lib/scope";
import { Avatar, Seal } from "./ui";

export type View = "student" | "security" | "outside" | "log" | "reports";

interface NavItem {
  id: View;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export default function AppHeader({
  user,
  view,
  onNavigate,
  onSignOut,
  pendingCount,
  outsideCount,
}: {
  user: SessionUser;
  view: View;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
  pendingCount: number;
  outsideCount: number;
}) {
  const items: NavItem[] = user.isAdmin
    ? [
        { id: "security", label: "Requests", icon: Inbox, badge: pendingCount },
        { id: "outside", label: "Outside", icon: Footprints, badge: outsideCount },
        { id: "log", label: "Logs", icon: ScrollText },
        { id: "reports", label: "Reports", icon: Wrench },
      ]
    : [
        { id: "student", label: "Requests", icon: DoorOpen },
        { id: "reports", label: "Reports", icon: Wrench },
      ];

  const subtitle = user.isAdmin ? scopeLabel(user.adminScope) : user.entry;

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <Seal size={34} />
          <div className="brand-text">
            <span className="brand-name">GatePass</span>
            <span className="brand-sub">IIT Delhi Abu Dhabi</span>
          </div>
        </div>

        <nav className="nav" aria-label="Sections">
          {items.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              className="nav-item"
              aria-current={view === id ? "page" : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="nav-label">{label}</span>
              {!!badge && (
                <span className={`nav-badge${id === "outside" ? " is-blue" : ""}`}>
                  <span className="sr-only">, </span>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="account">
          <Avatar name={user.name} size="sm" />
          <div className="account-text">
            <span className="account-name">{user.name}</span>
            <span className="account-sub">{subtitle}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
