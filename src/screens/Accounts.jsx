import React, { useEffect, useMemo, useState } from "react";
import { fmtTZS } from "../money.js";

export default function Accounts({
  accounts,
  accountTxns = [],
  onUpsertAccount,
  onDeleteAccount,
  onAddAccountTxn,
  onTransferAccount,
}) {
  const [filter, setFilter] = useState("all"); // all | debit | credit | asset
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [sectionOrder, setSectionOrder] = useState(() => {
    const fallback = ["debit", "credit", "asset"];
    try {
      const raw = localStorage.getItem("accounts_section_order");
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      const next = parsed.filter((t) => ["debit", "asset", "credit"].includes(t));
      if (!next.length) return fallback;
      if (next.join(",") === "debit,asset,credit") return fallback;
      return next;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    localStorage.setItem("accounts_section_order", JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  const totals = useMemo(() => {
    const assets = accounts
      .filter((a) => a.type === "debit" || a.type === "asset")
      .reduce((s, a) => s + Number(a.balance || 0), 0);

    const liabilities = accounts
      .filter((a) => a.type === "credit")
      .reduce((s, a) => s + Number(a.balance || 0), 0);

    return { assets, liabilities, netWorth: assets - liabilities };
  }, [accounts]);

  const shown = useMemo(() => {
    if (filter === "all") return accounts;
    return accounts.filter((a) => a.type === filter);
  }, [accounts, filter]);

  const sections = useMemo(
    () => [
      {
        type: "debit",
        title: "Debit",
        right: `Bal. ${fmtTZS(
          accounts
            .filter((a) => a.type === "debit")
            .reduce((s, a) => s + Number(a.balance || 0), 0)
        )}`,
        items: shown.filter((a) => a.type === "debit"),
      },
      {
        type: "asset",
        title: "Assets",
        right: `Bal. ${fmtTZS(
          accounts
            .filter((a) => a.type === "asset")
            .reduce((s, a) => s + Number(a.balance || 0), 0)
        )}`,
        items: shown.filter((a) => a.type === "asset"),
      },
      {
        type: "credit",
        title: "Credit",
        right: `Owed ${fmtTZS(
          accounts
            .filter((a) => a.type === "credit")
            .reduce((s, a) => s + Number(a.balance || 0), 0)
        )}`,
        items: shown.filter((a) => a.type === "credit"),
        isCredit: true,
      },
    ],
    [accounts, shown]
  );

  function handleDragStart(type) {
    setDragging(type);
  }

  function handleDrop(type) {
    if (!dragging || dragging === type) {
      setDragging(null);
      return;
    }
    setSectionOrder((order) => {
      const next = order.filter((t) => t !== dragging);
      const targetIndex = next.indexOf(type);
      next.splice(targetIndex, 0, dragging);
      return next;
    });
    setDragging(null);
  }

  const selected = accounts.find((a) => a.id === selectedId);
  if (selected) {
    return (
      <AccountDetail
        account={selected}
        accounts={accounts}
        accountTxns={accountTxns}
        onClose={() => setSelectedId(null)}
        onAddAccountTxn={onAddAccountTxn}
        onTransferAccount={onTransferAccount}
        onUpsertAccount={onUpsertAccount}
      />
    );
  }

  return (
    <div className="accountsScreen">
      <div className="accHeader">
        <div className="accTitle">Accounts</div>

        <div className="row" style={{ alignItems: "center" }}>
          <label className="accFilter">
            <select
              className="accFilterSelect"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="debit">Debit</option>
              <option value="asset">Assets</option>
              <option value="credit">Credit</option>
            </select>
            <span className="accFilterCaret">▾</span>
          </label>

          <button
            className="fab"
            onClick={() => {
              const name = prompt("Account name?");
              if (!name) return;
              const type = prompt(
                'Type "debit", "credit", or "asset"?',
                "debit"
              );
              if (
                !type ||
                (type !== "debit" && type !== "credit" && type !== "asset")
              )
                return;
              const bal = prompt("Balance (number)?", "0");
              const balance = Number(bal || 0);
              onUpsertAccount({
                id: crypto.randomUUID(),
                name,
                type,
                balance,
              });
            }}
            title="Add account"
          >
            +
          </button>
        </div>
      </div>

      <div className="netCard">
        <div className="netTop">
          <div className="netLabel">Net Worth</div>
          <div className="netValue">{fmtTZS(totals.netWorth)}</div>
        </div>

        <div className="netBottom">
          <div className="netMini">
            <div className="miniLabel">Assets</div>
            <div className="miniValue">{fmtTZS(totals.assets)}</div>
          </div>
          <div className="netMini">
            <div className="miniLabel">Liabilities</div>
            <div className="miniValue">{fmtTZS(totals.liabilities)}</div>
          </div>
        </div>
      </div>

      {sectionOrder.map((key) => {
        const section = sections.find((s) => s.type === key);
        if (!section) return null;
        return (
          <Section
            key={section.type}
            title={section.title}
            right={section.right}
            items={section.items}
            onDeleteAccount={onDeleteAccount}
            onSelectAccount={(id) => setSelectedId(id)}
            isCredit={section.isCredit}
            isDragging={dragging === section.type}
            dragOver={dragging && dragging !== section.type}
            onDragStart={() => handleDragStart(section.type)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(section.type)}
          />
        );
      })}
    </div>
  );
}

function Section({
  title,
  right,
  items,
  onDeleteAccount,
  onSelectAccount,
  isCredit,
  isDragging,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  return (
    <div
      className={`sectionCard ${isDragging ? "dragging" : ""} ${dragOver ? "dragOver" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="sectionHead">
        <div className="sectionTitle">
          <button
            className="sectionDragHandle"
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ≡
          </button>
          <span>{title}</span>
        </div>
        <div className="sectionRightWrap">
          <div className={"sectionRight " + (isCredit ? "owed" : "")}>
            {right}
          </div>
          <span className="sectionCaret">▾</span>
        </div>
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="emptyRow">No accounts</div>
        ) : (
          items.map((a) => (
            <div
              className="rowItem clickable"
              key={a.id}
              onClick={() => onSelectAccount?.(a.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectAccount?.(a.id);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="rowLeft">
                <div className="avatar">{a.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="rowName">{a.name}</div>
                  <div className="rowMeta">{a.type}</div>
                </div>
              </div>

              <div className="rowRight">
                <div className={"rowAmount " + (a.type === "credit" ? "neg" : "")}>
                  {fmtTZS(a.balance)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatDay(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function AccountDetail({
  account,
  accounts,
  accountTxns,
  onClose,
  onAddAccountTxn,
  onTransferAccount,
  onUpsertAccount,
}) {
  const [mode, setMode] = useState("adjust"); // adjust | transfer
  const [direction, setDirection] = useState("out"); // in | out
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [targetId, setTargetId] = useState(
    accounts.find((a) => a.id !== account.id)?.id || ""
  );
  const [error, setError] = useState("");

  const entries = useMemo(() => {
    return accountTxns
      .filter((t) => t.accountId === account.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [accountTxns, account.id]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of entries) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    return Array.from(map.entries());
  }, [entries]);

  async function handleAdjust() {
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError("");
    await onAddAccountTxn({
      accountId: account.id,
      amount: amt,
      direction,
      note,
    });
    setAmount("");
    setNote("");
  }

  async function handleTransfer() {
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!targetId || targetId === account.id) {
      setError("Select a different account.");
      return;
    }
    setError("");
    await onTransferAccount({
      fromId: account.id,
      toId: targetId,
      amount: amt,
      note,
    });
    setAmount("");
    setNote("");
  }

  function handleEdit() {
    const name = prompt("Rename account?", account.name);
    if (!name) return;
    onUpsertAccount({ ...account, name });
  }

  return (
    <div className="accountsScreen accountDetail">
      <div className="accDetailHeader">
        <button className="iconBtn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="accDetailTitle">{account.name}</div>
        <button className="pillBtn" onClick={handleEdit}>
          Edit
        </button>
      </div>

      <div className="accDetailCard">
        <div className="rowLeft">
          <div className="avatar">{account.name.slice(0, 1).toUpperCase()}</div>
          <div className="accDetailName">{account.name}</div>
        </div>
        <div className="accDetailBalance">{fmtTZS(account.balance)}</div>
        <div className="accDetailActions">
          <button
            className={"quickBtn " + (mode === "adjust" ? "active" : "")}
            onClick={() => setMode("adjust")}
            title="Add or spend"
            type="button"
          >
            +
          </button>
          <button
            className={"quickBtn transfer " + (mode === "transfer" ? "active" : "")}
            onClick={() => setMode("transfer")}
            title="Transfer"
            type="button"
          >
            ⇄
          </button>
        </div>
      </div>

      <div className="accQuickForm">
        <div className="field">
          <label>Amount (TZS)</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10000"
          />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Cash top up"
          />
        </div>

        {mode === "adjust" ? (
          <div className="row" style={{ alignItems: "center" }}>
            <div className="segmented">
              <button
                className={direction === "in" ? "active" : ""}
                onClick={() => setDirection("in")}
                type="button"
              >
                In
              </button>
              <button
                className={direction === "out" ? "active" : ""}
                onClick={() => setDirection("out")}
                type="button"
              >
                Out
              </button>
            </div>
            <button className="btn primary" onClick={handleAdjust} type="button">
              Apply
            </button>
          </div>
        ) : (
          <div className="row" style={{ alignItems: "center" }}>
            <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
              <label>To account</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="" disabled>
                  Select account
                </option>
                {accounts
                  .filter((a) => a.id !== account.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <button className="btn primary" onClick={handleTransfer} type="button">
              Transfer
            </button>
          </div>
        )}

        {error && <div className="formError">{error}</div>}
      </div>

      <div className="accTxnHeader">
        <div className="accTxnTitle">Transactions</div>
        <div className="accTxnToggle">
          <button className="active" type="button">
            Day
          </button>
          <button type="button">Month</button>
        </div>
      </div>

      <div className="accTxnList">
        {grouped.length === 0 ? (
          <div className="emptyRow">No transactions yet.</div>
        ) : (
          grouped.map(([date, items]) => {
            const totals = items.reduce(
              (s, t) => {
                if (t.direction === "in") s.in += Number(t.amount || 0);
                else s.out += Number(t.amount || 0);
                return s;
              },
              { in: 0, out: 0 }
            );

            return (
              <div className="accTxnGroup" key={date}>
                <div className="accTxnGroupHead">
                  <div>{formatDay(date)}</div>
                  <div className="accTxnGroupTotals">
                    {totals.in > 0 && <span className="in">IN {fmtTZS(totals.in)}</span>}
                    {totals.out > 0 && <span className="out">OUT {fmtTZS(totals.out)}</span>}
                  </div>
                </div>

                <div className="accTxnGroupBody">
                  {items.map((t) => {
                    const other =
                      t.relatedAccountId &&
                      accounts.find((a) => a.id === t.relatedAccountId);
                    const title =
                      t.kind === "transfer"
                        ? `Transfer ${t.direction === "out" ? "to" : "from"} ${
                            other ? other.name : "account"
                          }`
                        : t.note || "Balance update";
                    const sub =
                      t.kind === "transfer" && t.note
                        ? t.note
                        : t.kind !== "transfer"
                        ? t.note
                        : "";
                    return (
                      <div className="accTxnRow" key={t.id}>
                        <div className="accTxnIcon">
                          {t.kind === "transfer" ? "⇄" : t.direction === "in" ? "＋" : "−"}
                        </div>
                        <div className="accTxnInfo">
                          <div className="accTxnName">{title}</div>
                          {sub && <div className="accTxnMeta">{sub}</div>}
                        </div>
                        <div className={"accTxnAmount " + (t.direction === "in" ? "pos" : "neg")}>
                          {t.direction === "in" ? "+" : "-"}
                          {fmtTZS(t.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
