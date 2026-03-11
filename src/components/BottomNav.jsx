import React from "react";

export default function BottomNav({ tab, setTab, variant = "light" }) {
  const InsightsIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
      <rect x="3" y="13" width="4" height="7" rx="1" fill="#f97316" />
      <rect x="10" y="8" width="4" height="12" rx="1" fill="#f97316" />
      <rect x="17" y="3" width="4" height="17" rx="1" fill="#f97316" />
    </svg>
  );

  const items = [
    { key: "insights", label: "Insights", icon: InsightsIcon },
    { key: "tx", label: "Transactions", icon: "📄" },
    { key: "accounts", label: "Accounts", icon: "💳" },
    { key: "settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className={"bottomNav " + (variant === "light" ? "light" : "")}>
      {items.map((it) => (
        <button
          key={it.key}
          className={"navItem " + (tab === it.key ? "active" : "")}
          onClick={() => setTab(it.key)}
        >
          <div className="navIcon">{it.icon}</div>
          <div className="navLabel">{it.label}</div>
        </button>
      ))}
    </div>
  );
}
