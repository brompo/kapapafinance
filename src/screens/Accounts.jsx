import React, { useEffect, useMemo, useState } from "react";
import { fmtTZS } from "../money.js";

export default function Accounts({
  accounts,
  accountTxns = [],
  groups = [],
  onUpsertAccount,
  onDeleteAccount,
  onAddAccountTxn,
  onTransferAccount,
  onUpdateAccountTxn,
  onDeleteAccountTxn,
  onUpdateGroups,
  onUpdateAccounts,
}) {
  const [filter, setFilter] = useState("all"); // all | debit | credit | asset
  const [selectedId, setSelectedId] = useState(null);
  const [draggingGroupId, setDraggingGroupId] = useState(null);
  const [draggingAccountId, setDraggingAccountId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [dragOverAccountId, setDragOverAccountId] = useState(null);
  const [expandedAccounts, setExpandedAccounts] = useState({});

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const visibleAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  function daysBetween(a, b) {
    const start = new Date(a);
    const end = new Date(b);
    const ms = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.max(0, Math.floor(ms / 86400000));
  }

  function monthsBetween(a, b) {
    const start = new Date(a);
    const end = new Date(b);
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
  }

  function computeAccruedForAccount(account) {
    const creditEntries = accountTxns.filter((t) => t.accountId === account.id && t.kind === "credit");
    const today = new Date().toISOString().slice(0, 10);
    let accrued = 0;
    creditEntries.forEach((t) => {
      const rate = Number(t.creditRate || 0) / 100;
      if (!rate || !t.interestStartDate) return;
      const start = t.interestStartDate;
      if (t.creditType === "compound") {
        const months = monthsBetween(start, today);
        const monthlyRate = rate / 12;
        const compounded = Number(t.amount || 0) * Math.pow(1 + monthlyRate, months);
        const monthStart = new Date(start);
        monthStart.setMonth(monthStart.getMonth() + months);
        const remDays = daysBetween(monthStart.toISOString().slice(0, 10), today);
        const dailyRate = rate / 365;
        accrued += compounded * dailyRate * remDays + (compounded - Number(t.amount || 0));
      } else {
        const days = daysBetween(start, today);
        accrued += Number(t.amount || 0) * rate * (days / 365);
      }
    });
    return accrued;
  }

  function getAccountBalance(account) {
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    const base = subs.length
      ? subs.reduce((s, sub) => s + Number(sub.balance || 0), 0)
      : Number(account.balance || 0);
    const groupType = groupById.get(account.groupId)?.type;
    if (groupType === "credit") return base + computeAccruedForAccount(account);
    return base;
  }

  const totals = useMemo(() => {
    const assets = visibleAccounts
      .filter((a) => {
        const g = groupById.get(a.groupId);
        return g?.type === "debit" || g?.type === "asset";
      })
      .reduce((s, a) => s + getAccountBalance(a), 0);

    const liabilities = visibleAccounts
      .filter((a) => groupById.get(a.groupId)?.type === "credit")
      .reduce((s, a) => s + getAccountBalance(a), 0);

    return { assets, liabilities, netWorth: assets - liabilities };
  }, [visibleAccounts, groupById]);

  const shownGroups = useMemo(() => {
    if (filter === "all") return groups;
    return groups.filter((g) => g.type === filter);
  }, [groups, filter]);

  function handleAddGroup() {
    const name = prompt("Group name?");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const type = prompt('Group type: "debit", "credit", or "asset"?', "debit");
    if (!type || (type !== "debit" && type !== "credit" && type !== "asset")) return;
    const next = [
      ...groups,
      { id: crypto.randomUUID(), name: trimmed, type, collapsed: false },
    ];
    onUpdateGroups?.(next);
  }

  function handleAddAccount(group) {
    const name = prompt("Account name?");
    if (!name) return;
    const bal = prompt("Balance (number)?", "0");
    const balance = Number(bal || 0);
    if (!group) return;
    onUpsertAccount?.({
      id: crypto.randomUUID(),
      name,
      balance,
      groupId: group.id,
      groupType: group.type,
    });
  }

  function handleGroupDragStart(id) {
    setDraggingGroupId(id);
  }

  function handleGroupDrop(id) {
    if (!draggingGroupId || draggingGroupId === id) {
      setDraggingGroupId(null);
      return;
    }
    const next = groups.filter((g) => g.id !== draggingGroupId);
    const targetIndex = next.findIndex((g) => g.id === id);
    if (targetIndex >= 0) {
      const dragged = groups.find((g) => g.id === draggingGroupId);
      if (dragged) next.splice(targetIndex, 0, dragged);
      onUpdateGroups?.(next);
    }
    setDraggingGroupId(null);
    setDragOverGroupId(null);
  }

  function handleAccountDragStart(id) {
    setDraggingAccountId(id);
  }

  function handleAccountDrop(targetId, groupId) {
    if (!draggingAccountId || draggingAccountId === targetId) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }
    const dragged = visibleAccounts.find((a) => a.id === draggingAccountId);
    const target = visibleAccounts.find((a) => a.id === targetId);
    if (!dragged || !target || dragged.groupId !== groupId || target.groupId !== groupId) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }
    const next = accounts.filter((a) => a.id !== draggingAccountId);
    const targetIndex = next.findIndex((a) => a.id === targetId);
    next.splice(targetIndex, 0, dragged);
    onUpdateAccounts?.(next);
    setDraggingAccountId(null);
    setDragOverAccountId(null);
  }

  function handleAccountDropToGroup(groupId) {
    if (!draggingAccountId) return;
    const dragged = visibleAccounts.find((a) => a.id === draggingAccountId);
    if (!dragged || dragged.groupId !== groupId) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }
    const next = accounts.filter((a) => a.id !== draggingAccountId);
    const insertIndex = next.findIndex((a) => a.groupId === groupId);
    if (insertIndex === -1) next.push(dragged);
    else next.splice(insertIndex, 0, dragged);
    onUpdateAccounts?.(next);
    setDraggingAccountId(null);
    setDragOverAccountId(null);
  }

  function toggleGroupCollapse(group) {
    const next = groups.map((g) =>
      g.id === group.id ? { ...g, collapsed: !g.collapsed } : g
    );
    onUpdateGroups?.(next);
  }

  function toggleAccountExpand(id) {
    setExpandedAccounts((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selected = visibleAccounts.find((a) => a.id === selectedId);
  if (selected) {
    return (
      <AccountDetail
        account={selected}
        accounts={visibleAccounts}
        groups={groups}
        accountTxns={accountTxns}
        onClose={() => setSelectedId(null)}
        onAddAccountTxn={onAddAccountTxn}
        onTransferAccount={onTransferAccount}
        onUpsertAccount={onUpsertAccount}
        onDeleteAccount={onDeleteAccount}
        onUpdateAccountTxn={onUpdateAccountTxn}
        onDeleteAccountTxn={onDeleteAccountTxn}
      />
    );
  }

  return (
    <div className="accountsScreen">
      <div className="netCard">
        <div className="netTop">
          <div className="netLabel">Net Worth</div>
          <div className="netValue">{fmtTZS(totals.netWorth)}</div>
        </div>

        <div className="netBottom">
          <div className="netMini">
            <div className="miniLabel">Investment</div>
            <div className="miniValue">{fmtTZS(totals.assets)}</div>
          </div>
          <div className="netMini">
            <div className="miniLabel">Liabilities</div>
            <div className="miniValue">{fmtTZS(totals.liabilities)}</div>
          </div>
        </div>
      </div>

      <div className="accHeader">
        <div className="accTitle">Accounts</div>
      </div>

      {shownGroups.map((group) => {
        const items = visibleAccounts.filter((a) => a.groupId === group.id);
        const total = items.reduce((s, a) => s + getAccountBalance(a), 0);
        const right = group.type === "credit" ? `Owed ${fmtTZS(total)}` : `Bal. ${fmtTZS(total)}`;
        const handleRenameGroup = () => {
          const name = prompt("Rename group?", group.name);
          if (!name) return;
          const trimmed = name.trim();
          if (!trimmed) return;
          const next = groups.map((g) => (g.id === group.id ? { ...g, name: trimmed } : g));
          onUpdateGroups?.(next);
        };
        return (
          <Section
            key={group.id}
            group={group}
            right={right}
            items={items}
            onDeleteAccount={onDeleteAccount}
            onSelectAccount={(id) => setSelectedId(id)}
            onToggleCollapse={() => toggleGroupCollapse(group)}
            onRenameGroup={handleRenameGroup}
            onAddAccount={() => handleAddAccount(group)}
            isDragging={draggingGroupId === group.id}
            dragOver={dragOverGroupId === group.id}
            onDragStart={() => handleGroupDragStart(group.id)}
            onDragEnd={() => {
              setDraggingGroupId(null);
              setDragOverGroupId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggingGroupId) setDragOverGroupId(group.id);
            }}
            onDrop={() => handleGroupDrop(group.id)}
            onAccountDragStart={handleAccountDragStart}
            onAccountDragOver={(id) => setDragOverAccountId(id)}
            onAccountDrop={handleAccountDrop}
            onAccountDropToGroup={handleAccountDropToGroup}
            draggingAccountId={draggingAccountId}
            dragOverAccountId={dragOverAccountId}
            getAccountBalance={getAccountBalance}
            expandedAccounts={expandedAccounts}
            onToggleAccountExpand={toggleAccountExpand}
          />
        );
      })}
    </div>
  );
}

function Section({
  group,
  right,
  items,
  onDeleteAccount,
  onSelectAccount,
  onToggleCollapse,
  onRenameGroup,
  onAddAccount,
  isDragging,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAccountDragStart,
  onAccountDragOver,
  onAccountDrop,
  onAccountDropToGroup,
  draggingAccountId,
  dragOverAccountId,
  getAccountBalance,
  expandedAccounts,
  onToggleAccountExpand,
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
          <button className="sectionTitleBtn" type="button" onClick={onRenameGroup}>
            {group.name}
          </button>
        </div>
        <div className="sectionRightWrap">
          <div className={`sectionRight ${group.type === "credit" ? "owed" : ""}`}>{right}</div>
          <button className="sectionAddBtn" type="button" onClick={onAddAccount}>
            +
          </button>
          <button className="sectionCollapse" type="button" onClick={onToggleCollapse}>
            {group.collapsed ? "▸" : "▾"}
          </button>
        </div>
      </div>

      {!group.collapsed && (
        <div
          className="list"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onAccountDropToGroup?.(group.id)}
        >
          {items.length === 0 ? (
            <div className="emptyRow">No accounts</div>
          ) : (
            items.reduce((nodes, a) => {
              nodes.push(
                <div
                  className={`rowItem clickable ${
                    draggingAccountId === a.id ? "dragging" : ""
                  } ${dragOverAccountId === a.id ? "dragOver" : ""}`}
                  key={a.id}
                  onClick={() => onSelectAccount?.(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelectAccount?.(a.id);
                  }}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={() => onAccountDragStart?.(a.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onAccountDragOver?.(a.id);
                  }}
                  onDrop={() => onAccountDrop?.(a.id, group.id)}
                  onDragEnd={() => onAccountDragOver?.(null)}
                >
                  <div className="rowLeft">
                    <div className="avatar">{a.name.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <div className="rowName">{a.name}</div>
                      <div className="rowMeta">{group.type}</div>
                    </div>
                  </div>

                  <div className={`rowRight ${Array.isArray(a.subAccounts) && a.subAccounts.length ? "rowRightStack" : ""}`}>
                    <div
                      className={`rowAmount ${
                        group.type === "credit" || getAccountBalance(a) < 0 ? "neg" : ""
                      }`}
                    >
                      {fmtTZS(getAccountBalance(a))}
                    </div>
                    {Array.isArray(a.subAccounts) && a.subAccounts.length > 0 && (
                      <button
                        className="miniBtn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleAccountExpand?.(a.id);
                        }}
                      >
                        {expandedAccounts?.[a.id] ? "Hide Sub Accounts" : "Show Sub Accounts"}
                      </button>
                    )}
                  </div>
                </div>
              );

              const subs = Array.isArray(a.subAccounts) ? a.subAccounts : [];
              if (subs.length && expandedAccounts?.[a.id]) {
                subs.forEach((s) => {
                  nodes.push(
                    <div className="rowItem subRow" key={`${a.id}-${s.id}`}>
                      <div className="rowLeft">
                        <div className="avatar subAvatar">
                          {s.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="rowName">{s.name}</div>
                          <div className="rowMeta">Sub-account</div>
                        </div>
                      </div>
                      <div className="rowRight">
                        <div className={`rowAmount ${Number(s.balance || 0) < 0 ? "neg" : ""}`}>
                          {fmtTZS(s.balance)}
                        </div>
                      </div>
                    </div>
                  );
                });
              }
              return nodes;
            }, [])
          )}
        </div>
      )}
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
  groups,
  accountTxns,
  onClose,
  onAddAccountTxn,
  onTransferAccount,
  onUpsertAccount,
  onDeleteAccount,
  onUpdateAccountTxn,
  onDeleteAccountTxn,
}) {
  const currentGroup = groups.find((g) => g.id === account.groupId);
  const [mode, setMode] = useState(null); // adjust | transfer | null
  const [direction, setDirection] = useState("in"); // in | out
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [targetId, setTargetId] = useState(
    accounts.find((a) => a.id !== account.id)?.id || ""
  );
  const [subAccountId, setSubAccountId] = useState(
    Array.isArray(account.subAccounts) && account.subAccounts.length
      ? account.subAccounts[0].id
      : ""
  );
  const [targetSubId, setTargetSubId] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditRate, setCreditRate] = useState("");
  const [creditType, setCreditType] = useState("simple");
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [interestStartDate, setInterestStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [editTxnNote, setEditTxnNote] = useState("");
  const [editTxnDate, setEditTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editCreditRate, setEditCreditRate] = useState("");
  const [editCreditType, setEditCreditType] = useState("simple");
  const [editReceiveDate, setEditReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editInterestStartDate, setEditInterestStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    if (subs.length && !subAccountId) setSubAccountId(subs[0].id);
  }, [account.subAccounts, subAccountId]);

  useEffect(() => {
    const target = accounts.find((a) => a.id === targetId);
    const subs = Array.isArray(target?.subAccounts) ? target.subAccounts : [];
    if (!subs.length) {
      setTargetSubId("");
      return;
    }
    if (!subs.find((s) => s.id === targetSubId)) setTargetSubId(subs[0].id);
  }, [targetId, accounts, targetSubId]);
  useEffect(() => {
    if (!selectedTxn) return;
    setEditTxnAmount(String(selectedTxn.amount || ""));
    setEditTxnNote(selectedTxn.note || "");
    setEditTxnDate(selectedTxn.date || new Date().toISOString().slice(0, 10));
    setEditCreditRate(String(selectedTxn.creditRate ?? ""));
    setEditCreditType(selectedTxn.creditType || "simple");
    setEditReceiveDate(selectedTxn.receiveDate || selectedTxn.date || new Date().toISOString().slice(0, 10));
    setEditInterestStartDate(selectedTxn.interestStartDate || selectedTxn.date || new Date().toISOString().slice(0, 10));
  }, [selectedTxn]);

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
    if (Array.isArray(account.subAccounts) && account.subAccounts.length && !subAccountId) {
      setError("Select a sub-account.");
      return;
    }
    setError("");
    await onAddAccountTxn({
      accountId: account.id,
      subAccountId: subAccountId || null,
      amount: amt,
      direction,
      note,
    });
    setAmount("");
    setNote("");
    setMode(null);
  }

  async function handleTransfer() {
    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!targetId) {
      setError("Select a target account.");
      return;
    }
    if (Array.isArray(account.subAccounts) && account.subAccounts.length && !subAccountId) {
      setError("Select a sub-account.");
      return;
    }
    const target = accounts.find((a) => a.id === targetId);
    if (Array.isArray(target?.subAccounts) && target.subAccounts.length && !targetSubId) {
      setError("Select a target sub-account.");
      return;
    }
    if (targetId === account.id && subAccountId === targetSubId) {
      setError("Select a different sub-account.");
      return;
    }
    setError("");
    await onTransferAccount({
      fromId: account.id,
      toId: targetId,
      amount: amt,
      note,
      fromSubAccountId: subAccountId || null,
      toSubAccountId: targetSubId || null,
      date: transferDate,
    });
    setAmount("");
    setNote("");
    setMode(null);
  }

  function handleDelete() {
    const hasTxns = accountTxns.some((t) => t.accountId === account.id);
    if (!hasTxns) {
      if (!confirm("Delete this account?")) return;
      onDeleteAccount?.(account.id);
      onClose();
      return;
    }
    const ok = confirm(
      "This account has transactions. You can't delete it unless you remove the transactions first. Archive instead?"
    );
    if (!ok) return;
    onUpsertAccount?.({ ...account, archived: true });
    onClose();
  }

  function handleEdit() {
    const name = prompt("Rename account?", account.name);
    if (!name) return;
    const sameTypeGroups = groups.filter((g) => g.type === currentGroup?.type);
    let nextGroupId = account.groupId;
    if (sameTypeGroups.length > 1) {
      const list = sameTypeGroups
        .map((g, i) => `${i + 1}) ${g.name}`)
        .join("\n");
      const pick = prompt(`Move to group (same type):\n${list}`, "1");
      const idx = Number(pick || 0) - 1;
      if (sameTypeGroups[idx]) nextGroupId = sameTypeGroups[idx].id;
    }
    onUpsertAccount({ ...account, name, groupId: nextGroupId, groupType: currentGroup?.type });
  }

  function daysBetween(a, b) {
    const start = new Date(a);
    const end = new Date(b);
    const ms = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.max(0, Math.floor(ms / 86400000));
  }

  function monthsBetween(a, b) {
    const start = new Date(a);
    const end = new Date(b);
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
  }

  function computeCreditSummary() {
    const creditEntries = accountTxns.filter((t) => t.accountId === account.id && t.kind === "credit");
    const principal = creditEntries.reduce((s, t) => s + Number(t.amount || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    let accrued = 0;
    creditEntries.forEach((t) => {
      const rate = Number(t.creditRate || 0) / 100;
      if (!rate || !t.interestStartDate) return;
      const start = t.interestStartDate;
      if (t.creditType === "compound") {
        const months = monthsBetween(start, today);
        const monthlyRate = rate / 12;
        const compounded = Number(t.amount || 0) * Math.pow(1 + monthlyRate, months);
        const monthStart = new Date(start);
        monthStart.setMonth(monthStart.getMonth() + months);
        const remDays = daysBetween(monthStart.toISOString().slice(0, 10), today);
        const dailyRate = rate / 365;
        accrued += compounded * dailyRate * remDays + (compounded - Number(t.amount || 0));
      } else {
        const days = daysBetween(start, today);
        accrued += Number(t.amount || 0) * rate * (days / 365);
      }
    });
    return { principal, accrued };
  }

  async function handleAddCredit() {
    const amt = Number(creditAmount || 0);
    const rate = Number(creditRate || 0);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (rate < 0) {
      setError("Enter a valid interest rate.");
      return;
    }
    setError("");
    await onAddAccountTxn({
      accountId: account.id,
      amount: amt,
      direction: "in",
      note: "",
      kind: "credit",
      creditRate: rate,
      creditType,
      receiveDate,
      interestStartDate
    });
    setCreditAmount("");
    setCreditRate("");
    setShowCreditModal(false);
  }

  function handleSaveTxnEdit() {
    if (!selectedTxn) return;
    if (selectedTxn.kind === "transfer") return;
    const amt = Number(editTxnAmount || 0);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (selectedTxn.kind === "credit") {
      const rate = Number(editCreditRate || 0);
      if (rate < 0) {
        setError("Enter a valid interest rate.");
        return;
      }
    }
    setError("");
    if (selectedTxn.kind === "credit") {
      onUpdateAccountTxn?.(selectedTxn.id, {
        amount: amt,
        note: editTxnNote || "",
        date: editTxnDate || selectedTxn.date,
        creditRate: Number(editCreditRate || 0),
        creditType: editCreditType,
        receiveDate: editReceiveDate || editTxnDate || selectedTxn.date,
        interestStartDate: editInterestStartDate || editTxnDate || selectedTxn.date
      });
    } else {
      onUpdateAccountTxn?.(selectedTxn.id, {
        amount: amt,
        note: editTxnNote || "",
        date: editTxnDate || selectedTxn.date
      });
    }
    setSelectedTxn(null);
  }

  function handleAddSubAccount() {
    const name = prompt("Sub-account name?");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    const nextSubs = [...subs, { id: crypto.randomUUID(), name: trimmed, balance: 0 }];
    onUpsertAccount({ ...account, subAccounts: nextSubs });
    if (!subAccountId) setSubAccountId(nextSubs[0].id);
  }

  return (
    <div className="accountsScreen accountDetail">
      <div className="accDetailHeader">
        <button className="iconBtn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="row" style={{ gap: 8 }}>
          <button className="pillBtn" onClick={handleEdit}>
            Edit
          </button>
          <button className="pillBtn danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="accDetailCard">
        <div className="rowLeft">
          <div className="avatar">{account.name.slice(0, 1).toUpperCase()}</div>
          <div className="accDetailName">{account.name}</div>
        </div>
        <div className="accDetailBalance">
          {(() => {
            const base = Array.isArray(account.subAccounts) && account.subAccounts.length
              ? account.subAccounts.reduce((s, sub) => s + Number(sub.balance || 0), 0)
              : account.balance
            if (currentGroup?.type === "credit") {
              const summary = computeCreditSummary()
              return fmtTZS(Number(base || 0) + summary.accrued)
            }
            return fmtTZS(base)
          })()}
        </div>
        {currentGroup?.type === "credit" && (() => {
          const summary = computeCreditSummary();
          return (
            <div className="small" style={{ marginTop: 4 }}>
              Accrued interest: {fmtTZS(summary.accrued)}
            </div>
          );
        })()}
        <div className="accDetailActions">
          <button
            className={`quickBtn ${mode === "adjust" ? "active" : ""}`}
            onClick={() => {
              if (currentGroup?.type === "credit") setShowCreditModal(true);
              else setMode("adjust");
            }}
            title="Add or spend"
            type="button"
          >
            +
          </button>
          <button
            className={`quickBtn transfer ${mode === "transfer" ? "active" : ""}`}
            onClick={() => setMode("transfer")}
            title="Transfer"
            type="button"
          >
            ⇄
          </button>
        </div>
      </div>

      {currentGroup?.type === "credit" && (() => {
        const summary = computeCreditSummary();
        return (
          <div className="accHistory">
            <div className="accHistoryTitle">Credit Summary</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="small">Principal Received</div>
              <div style={{ fontWeight: 700 }}>{fmtTZS(summary.principal)}</div>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="small">Accrued Interest</div>
              <div style={{ fontWeight: 700 }}>{fmtTZS(summary.accrued)}</div>
            </div>
          </div>
        );
      })()}

      <div className="accHistory">
        <div className="accHistoryTitle">Sub-accounts</div>
        {Array.isArray(account.subAccounts) && account.subAccounts.length > 0 ? (
          <div className="list">
            {account.subAccounts.map((s) => (
              <div className="rowItem subRow" key={s.id}>
                <div className="rowLeft">
                  <div className="avatar subAvatar">{s.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="rowName">{s.name}</div>
                    <div className="rowMeta">Sub-account</div>
                  </div>
                </div>
                <div className="rowRight">
                  <div className="rowAmount">{fmtTZS(s.balance)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="emptyRow">No sub-accounts yet.</div>
        )}
        <button className="btn" type="button" onClick={handleAddSubAccount}>
          Add Sub-account
        </button>
      </div>

      {mode && (
        <div className="modalBackdrop" onClick={() => setMode(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">{mode === "transfer" ? "Transfer" : "Add Money"}</div>
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

              {mode === "transfer" ? (
                <>
                  <div className="field">
                    <label>Date</label>
                    <input
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>From account</label>
                    <input value={account.name} readOnly />
                  </div>

                  {Array.isArray(account.subAccounts) && account.subAccounts.length > 0 && (
                    <div className="field">
                      <label>From sub-account</label>
                      <select value={subAccountId} onChange={(e) => setSubAccountId(e.target.value)}>
                        <option value="">Select</option>
                        {account.subAccounts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="field">
                    <label>To account</label>
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const target = accounts.find((a) => a.id === targetId);
                    if (!Array.isArray(target?.subAccounts) || target.subAccounts.length === 0) return null;
                    return (
                      <div className="field">
                        <label>To sub-account</label>
                        <select value={targetSubId} onChange={(e) => setTargetSubId(e.target.value)}>
                          <option value="">Select</option>
                          {target.subAccounts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  <div className="field">
                    <label>Note (optional)</label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Bus fare"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Note (optional)</label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Bus fare"
                    />
                  </div>

                  {Array.isArray(account.subAccounts) && account.subAccounts.length > 0 && (
                    <div className="field">
                      <label>Sub-account</label>
                      <select value={subAccountId} onChange={(e) => setSubAccountId(e.target.value)}>
                        <option value="">Select</option>
                        {account.subAccounts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {error && <div className="formError">{error}</div>}

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" type="button" onClick={() => setMode(null)}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={mode === "transfer" ? handleTransfer : handleAdjust}
                >
                  {mode === "transfer" ? "Transfer" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreditModal && (
        <div className="modalBackdrop" onClick={() => setShowCreditModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Add Credit</div>
            <div className="accQuickForm">
              <div className="field">
                <label>Amount (TZS)</label>
                <input
                  inputMode="decimal"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 100000"
                />
              </div>
              <div className="field">
                <label>Interest Rate (%)</label>
                <input
                  inputMode="decimal"
                  value={creditRate}
                  onChange={(e) => setCreditRate(e.target.value)}
                  placeholder="e.g. 2"
                />
              </div>
              <div className="field">
                <label>Interest Type</label>
                <select value={creditType} onChange={(e) => setCreditType(e.target.value)}>
                  <option value="simple">Simple</option>
                  <option value="compound">Compound</option>
                </select>
              </div>
              <div className="field">
                <label>Receiving Date</label>
                <input
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Interest Start Date</label>
                <input
                  type="date"
                  value={interestStartDate}
                  onChange={(e) => setInterestStartDate(e.target.value)}
                />
              </div>
              {error && <div className="formError">{error}</div>}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" type="button" onClick={() => setShowCreditModal(false)}>
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={handleAddCredit}>
                  Save Credit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTxn && (
        <div className="modalBackdrop" onClick={() => setSelectedTxn(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">
              {selectedTxn.kind === "credit" ? "Edit Credit" : "Transaction"}
            </div>
            {selectedTxn.kind === "transfer" && (
              <div className="small" style={{ marginBottom: 8 }}>
                Transfers can be deleted, but not edited here.
              </div>
            )}
            <div className="accQuickForm">
              <div className="field">
                <label>Amount (TZS)</label>
                <input
                  inputMode="decimal"
                  value={editTxnAmount}
                  onChange={(e) => setEditTxnAmount(e.target.value)}
                  disabled={selectedTxn.kind === "transfer"}
                />
              </div>
              {selectedTxn.kind === "credit" && (
                <div className="field">
                  <label>Interest Rate (%)</label>
                  <input
                    inputMode="decimal"
                    value={editCreditRate}
                    onChange={(e) => setEditCreditRate(e.target.value)}
                  />
                </div>
              )}
              {selectedTxn.kind === "credit" && (
                <div className="field">
                  <label>Interest Type</label>
                  <select value={editCreditType} onChange={(e) => setEditCreditType(e.target.value)}>
                    <option value="simple">Simple</option>
                    <option value="compound">Compound</option>
                  </select>
                </div>
              )}
              {selectedTxn.kind === "credit" && (
                <div className="field">
                  <label>Receiving Date</label>
                  <input
                    type="date"
                    value={editReceiveDate}
                    onChange={(e) => setEditReceiveDate(e.target.value)}
                  />
                </div>
              )}
              {selectedTxn.kind === "credit" && (
                <div className="field">
                  <label>Interest Start Date</label>
                  <input
                    type="date"
                    value={editInterestStartDate}
                    onChange={(e) => setEditInterestStartDate(e.target.value)}
                  />
                </div>
              )}
              <div className="field">
                <label>Note</label>
                <input
                  value={editTxnNote}
                  onChange={(e) => setEditTxnNote(e.target.value)}
                  disabled={selectedTxn.kind === "transfer"}
                />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={editTxnDate}
                  onChange={(e) => setEditTxnDate(e.target.value)}
                  disabled={selectedTxn.kind === "transfer"}
                />
              </div>
              {error && <div className="formError">{error}</div>}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" type="button" onClick={() => setSelectedTxn(null)}>
                  Close
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    onDeleteAccountTxn?.(selectedTxn.id);
                    setSelectedTxn(null);
                  }}
                >
                  Delete
                </button>
                {selectedTxn.kind !== "transfer" && (
                  <button className="btn primary" type="button" onClick={handleSaveTxnEdit}>
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="accHistory">
        <div className="accHistoryTitle">Recent activity</div>
        {grouped.length === 0 ? (
          <div className="emptyRow">No activity yet.</div>
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
              <div className="accHistoryCard" key={date}>
                <div className="accHistoryHead">
                  <div>{formatDay(date)}</div>
                  <div className="accHistoryTotals">
                    {totals.out > 0 && <span className="out">OUT {fmtTZS(totals.out)}</span>}
                    {totals.in > 0 && <span className="in">IN {fmtTZS(totals.in)}</span>}
                  </div>
                </div>
                <div className="accHistoryBody">
                  {items.map((t) => {
                    const subName =
                      account.subAccounts?.find((s) => s.id === t.subAccountId)?.name || "";
                    const title = t.note || "Balance update";
                    const meta = subName || (t.kind === "transfer" ? "Transfer" : "Account");
                    return (
                      <div
                        className="accHistoryRow"
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTxn(t)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedTxn(t);
                        }}
                      >
                        <div className="accHistoryIcon">
                          {(title || "A").slice(0, 1).toUpperCase()}
                        </div>
                      <div className="accHistoryInfo">
                        <div className="accHistoryTitleRow">{title}</div>
                        <div className="accHistoryMeta">{meta}</div>
                      </div>
                      <div className={`accHistoryAmount ${t.direction === "in" ? "pos" : "neg"}`}>
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
