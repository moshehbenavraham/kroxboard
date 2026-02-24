"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";
import { ThemeSwitcher } from "@/lib/theme";

const NAV_ITEMS = [
  {
    group: "nav.overview",
    items: [
      { href: "/", icon: "🤖", labelKey: "nav.agents" },
      { href: "/models", icon: "🧠", labelKey: "nav.models" },
    ],
  },
  {
    group: "nav.monitor",
    items: [
      { href: "/sessions", icon: "💬", labelKey: "nav.sessions" },
      { href: "/stats", icon: "📊", labelKey: "nav.stats" },
      { href: "/alerts", icon: "🔔", labelKey: "nav.alerts" },
      { href: "/pixel-office", icon: "🎮", labelKey: "nav.pixelOffice" },
    ],
  },
  {
    group: "nav.config",
    items: [
      { href: "/skills", icon: "🧩", labelKey: "nav.skills" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <aside
        className="sidebar"
        style={{ width: collapsed ? 64 : 224 }}
      >
        {/* Header: Logo + Toggle */}
        <div className="border-b border-[var(--border)]" style={{ padding: collapsed ? "16px 0" : "16px 20px" }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Link href="/">
                <span className="text-xl">🐾</span>
              </Link>
              <button
                onClick={() => setCollapsed(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                title="展开侧边栏"
              >
                »
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl">🐾</span>
                <div>
                  <div className="text-sm font-bold text-[var(--text)] tracking-wide">OPENCLAW</div>
                  <div className="text-[10px] text-[var(--text-muted)] tracking-wider">BOT DASHBOARD</div>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                <ThemeSwitcher />
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                  title="收起侧边栏"
                >
                  «
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="sidebar-nav" style={{ padding: collapsed ? "16px 8px" : "16px 12px" }}>
          <div className="space-y-5">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                {!collapsed && (
                  <div className="px-2 mb-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                    {t(group.group)}
                    <span className="text-[var(--text-muted)] opacity-40">—</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? t(item.labelKey) : undefined}
                        className={`flex items-center rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                            : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                        }`}
                        style={{
                          padding: collapsed ? "8px 0" : "8px 12px",
                          justifyContent: collapsed ? "center" : "flex-start",
                          gap: collapsed ? 0 : 10,
                        }}
                      >
                        <span className="text-base">{item.icon}</span>
                        {!collapsed && t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Spacer */}
      <div style={{ width: collapsed ? 64 : 224, flexShrink: 0, transition: "width 0.2s" }} />
    </>
  );
}
