import React from "react";

export default function BottomNav({ tab, setTab, variant = "light" }) {
  const items = [
    { key: "home", label: "Home", icon: "🏠" },
    { key: "accounts", label: "Accounts", icon: "💳" },
    { key: "tx", label: "Transactions", icon: "📄" },
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
