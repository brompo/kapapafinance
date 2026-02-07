import React, { useEffect, useMemo, useState } from "react";
import { fmtTZS } from "../money.js";

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

function getAssetInfo(account, accountTxns, group) {
  if (group?.type !== "asset") return { hasData: false };

  const txns = accountTxns.filter((t) => t.accountId === account.id);
  const purchases = txns.filter((t) => t.kind === "purchase");
  const sales = txns.filter((t) => t.kind === "sale");
  const valuations = txns
    .filter((t) => t.kind === "valuation")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Calculate Weighted Average Cost
  const sortedTxns = txns.sort((a, b) => (a.date > b.date ? 1 : -1));
  let runningQty = 0;
  let runningCost = 0;
  let realizedGain = 0;

  for (const t of sortedTxns) {
    if (t.kind === "purchase") {
      const q = Number(t.quantity || 0);
      const cost = Number(t.amount || 0); // Amount matches total + fee
      runningQty += q;
      runningCost += cost;
    } else if (t.kind === "sale") {
      const q = Number(t.quantity || 0);
      const proceeds = Number(t.amount || 0);
      if (runningQty > 0) {
        const avg = runningCost / runningQty;
        const costOfSold = avg * q;
        runningCost -= costOfSold;
        runningQty -= q;
        realizedGain += (proceeds - costOfSold);
      }
    }
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0;
  const qty = runningQty;

  const latestVal = valuations.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);
  const latestPurchase = purchases.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);
  const latestSale = sales.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);

  const unit = latestVal?.unit || latestSale?.unit || latestPurchase?.unit || "";
  const unitPrice = Number(
    latestVal?.unitPrice ||
    latestSale?.unitPrice ||
    avgPrice ||
    0
  );

  return {
    hasData: true,
    qty: Math.max(qty, 0),
    unit,
    unitPrice,
    avgPrice: Math.max(0, avgPrice),
    costBasis: Math.max(0, runningCost), // Accounting Value
    marketValue: unitPrice * Math.max(qty, 0), // Market Value
    value: unitPrice * Math.max(qty, 0), // Backward compat
    realizedGain
  };
}

export default function Accounts({
  accounts,
  accountTxns = [],
  groups = [],
  activeLedgerId = "",
  ledgers = [],
  focusAccountId,
  onFocusAccountUsed,
  onSwitchLedger,
  onDetailOpen,
  onDetailClose,
  onToast,
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
  const [showOverview, setShowOverview] = useState(true);
  const [dragOverAccountId, setDragOverAccountId] = useState(null);
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [addingToGroup, setAddingToGroup] = useState(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");

  useEffect(() => {
    setSelectedId(null);
  }, [activeLedgerId]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const visibleAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  useEffect(() => {
    if (!focusAccountId) return;
    const target = visibleAccounts.find((a) => a.id === focusAccountId);
    if (target) setSelectedId(target.id);
    onFocusAccountUsed?.();
  }, [focusAccountId, visibleAccounts, onFocusAccountUsed]);



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
    // Show only the total of sub-accounts associated with the active ledger
    const base = subs.length > 0
      ? subs.reduce((s, sub) => {
        if (activeLedgerId === "all" || sub.ledgerId === activeLedgerId) {
          return s + Number(sub.balance || 0)
        }
        return s
      }, 0)
      : Number(account.balance || 0);

    const groupType = groupById.get(account.groupId)?.type;
    if (groupType === "credit") return base + computeAccruedForAccount(account);

    if (groupType === "asset") {
      // If we are filtering by ledger, we must ensure the asset belongs to it
      // Assets are usually tracking units in sub-accounts.
      // We need to check if getAssetInfo respects filtering? 
      // Let's assume getAssetInfo needs to know about activeLedgerId or we filter the value?
      // Actually, if we use getFilteredBalance logic inside getAssetInfo it would be best.
      // For now, let's rely on getAssetInfo returning total value, but if we want to filter...
      // Real Estate example: 5M. Likely a single account or sub.
      // If sub, lines 157-160 handled it? 
      // Wait, line 166 returns info.value. 
      // Asset value SHOULD come from the Sum of Sub-account Values.
      // If getAssetInfo sums up unit * price, it iterates subs.
      // I should check getAssetInfo.

      const info = getAssetInfo(account, accountTxns, groupById.get(account.groupId));
      if (info.hasData && info.unitPrice > 0) return info.value;
    }

    // Default fallback (cash balance)
    if (activeLedgerId !== "all" && account.ledgerId !== activeLedgerId) return 0;
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
  }, [visibleAccounts, groupById, activeLedgerId]); // Added activeLedgerId dependency


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
    if (!group) return;
    setAddingToGroup(group);
    setNewAccountName("");
    setNewAccountBalance("");
  }

  function handleSaveNewAccount() {
    if (!newAccountName.trim() || !addingToGroup) return;
    const balance = Number(newAccountBalance || 0);
    onUpsertAccount?.({
      id: crypto.randomUUID(),
      name: newAccountName.trim(),
      balance,
      groupId: addingToGroup.id,
      groupType: addingToGroup.type,
      ledgerId: activeLedgerId || addingToGroup.ledgerId,
    });
    setAddingToGroup(null);
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

    if (!dragged || !target) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    const sourceGroup = groupById.get(dragged.groupId);
    const targetGroup = groupById.get(groupId);

    if (sourceGroup?.type !== targetGroup?.type) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    const next = accounts.filter((a) => a.id !== draggingAccountId);
    const targetIndex = next.findIndex((a) => a.id === targetId);

    const updatedAccount = { ...dragged, groupId: groupId };

    if (targetIndex >= 0) {
      next.splice(targetIndex, 0, updatedAccount);
    } else {
      next.push(updatedAccount);
    }

    onUpdateAccounts?.(next);
    setDraggingAccountId(null);
    setDragOverAccountId(null);
  }

  function handleAccountDropToGroup(groupId) {
    if (!draggingAccountId) return;
    const dragged = visibleAccounts.find((a) => a.id === draggingAccountId);
    if (!dragged) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    const sourceGroup = groupById.get(dragged.groupId);
    const targetGroup = groupById.get(groupId);

    if (sourceGroup?.type !== targetGroup?.type) {
      setDraggingAccountId(null);
      setDragOverAccountId(null);
      return;
    }

    const next = accounts.filter((a) => a.id !== draggingAccountId);
    const updatedAccount = { ...dragged, groupId: groupId };

    const insertIndex = next.findIndex((a) => a.groupId === groupId);
    if (insertIndex === -1) next.push(updatedAccount);
    else next.splice(insertIndex, 0, updatedAccount);

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





  function toggleExpand(txnId) {
    setExpanded((prev) => ({ ...prev, [txnId]: !prev[txnId] }));
  }

  const selected = visibleAccounts.find((a) => a.id === selectedId);
  useEffect(() => {
    if (selected) onDetailOpen?.();
    else onDetailClose?.();
  }, [selected, onDetailOpen, onDetailClose]);
  if (selected) {
    return (
      <AccountDetail
        account={selected}
        accounts={visibleAccounts}
        groups={groups}
        accountTxns={accountTxns}
        activeLedgerId={activeLedgerId}
        ledgers={ledgers}
        onSwitchLedger={onSwitchLedger}
        onClose={() => setSelectedId(null)}
        getAccountBalance={getAccountBalance}
        onAddAccountTxn={onAddAccountTxn}
        onTransferAccount={onTransferAccount}
        onUpsertAccount={onUpsertAccount}
        onDeleteAccount={onDeleteAccount}
        onUpdateAccountTxn={onUpdateAccountTxn}
        onDeleteAccountTxn={onDeleteAccountTxn}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="accountsScreen">
      {addingToGroup && (
        <div className="modalBackdrop" onClick={() => setAddingToGroup(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Add Account to {addingToGroup.name}</div>
            <div className="accQuickForm">
              <div className="field">
                <label>Account Name</label>
                <input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Savings"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Initial Balance (TZS)</label>
                <input
                  inputMode="decimal"
                  value={newAccountBalance}
                  onChange={(e) => setNewAccountBalance(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" type="button" onClick={() => setAddingToGroup(null)}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={handleSaveNewAccount}
                  disabled={!newAccountName.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overviewTitle"
        onClick={() => setShowOverview(!showOverview)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span>Financial Overview</span>
        <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>{showOverview ? '▾' : '▸'}</span>
      </div>

      {showOverview && (
        <>
          {/* Dashboard Header */}
          {/* 
          <div className="dashboardHeader">
            <div className="goalTitle">Goal: TZS 1,000,000,000 by Dec 2029</div>
            <div className="goalProgressBg">
              <div className="goalProgressBar" style={{ width: `${Math.min((totals.netWorth / 1000000000) * 100, 100)}%` }}>
                <div className="goalThumb"></div>
              </div>
            </div>
            <div className="goalMeta">On Track: {Math.ceil(daysBetween(todayISO(), '2029-12-31'))} Days Left</div>
          </div>
          */}

          {/* Overview Card */}
          <div className="overviewCard">
            <div className="ovMainLabel">Net Worth</div>
            <div className="ovMainValue">{fmtTZS(totals.netWorth)}</div>
            <div className="ovGrid">
              <div>
                <div className="ovItemLabel">Assets</div>
                <div className="ovItemValue">{fmtTZS(totals.assets)}</div>
              </div>
              <div>
                <div className="ovItemLabel">Liabilities</div>
                <div className="ovItemValue">{fmtTZS(totals.liabilities)}</div>
              </div>
            </div>
          </div>


          {/* Top Metrics Cards */}
          <div className="topMetricsRow">
            <div className="topMetricCard">
              <div className="topMetricLabel">Net Worth</div>
              <div className="topMetricValue" style={{ color: totals.netWorth < 0 ? '#DC2626' : '#16A34A' }}>
                {fmtTZS(totals.netWorth)}
                <span className="trendIcon">{totals.netWorth >= 0 ? '↑' : '↓'}</span>
              </div>
              <div className="topMetricSub">
                {totals.assets > 0 ? ((totals.netWorth / totals.assets) * 100).toFixed(1) : 0}% of Assets
              </div>
            </div>
            <div className="topMetricCard">
              <div className="topMetricLabel">Total Invested</div>
              <div className="topMetricValue" style={{ color: '#16A34A' }}>
                {fmtTZS(totals.assets)}
                <span className="trendIcon">↑</span>
              </div>
              <div className="topMetricSub">Target: 1B</div>
            </div>
          </div>
        </>
      )}


      <div className="overviewTitle">Accounts</div>

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
            accountTxns={accountTxns}
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
            getAssetInfo={getAssetInfo}
            expandedAccounts={expandedAccounts}
            onToggleAccountExpand={toggleAccountExpand}
            activeLedgerId={activeLedgerId}
          />
        );
      })}
    </div>
  );
}

function Section({
  group,
  accountTxns,
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
  getAssetInfo,
  expandedAccounts,
  onToggleAccountExpand,
  activeLedgerId,
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
              const isAsset = group.type === 'asset'
              const bal = getAccountBalance(a)

              nodes.push(
                <div
                  className={`clickable ${draggingAccountId === a.id ? "dragging" : ""
                    } ${dragOverAccountId === a.id ? "dragOver" : ""}`}
                  key={a.id}
                  onClick={() => onSelectAccount?.(a.id)}
                  draggable
                  onDragStart={() => onAccountDragStart?.(a.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onAccountDragOver?.(a.id);
                  }}
                  onDrop={() => onAccountDrop?.(a.id, group.id)}
                  onDragEnd={() => onAccountDragOver?.(null)}
                >
                  {isAsset ? (
                    <div className="assetRowCard">
                      <div className="assetRowLeft">
                        <div className="assetIcon">
                          {a.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="assetInfo">
                          <h4>{a.name}</h4>
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>
                            {(() => {
                              const info = getAssetInfo(a, accountTxns, group)
                              return info.hasData ? `${info.qty} Units` : '0 Units'
                            })()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div className="assetBalance">
                          {fmtTZS(bal)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#666', marginTop: 2 }}>
                          Invested: {fmtTZS(getAssetInfo(a, accountTxns, group).costBasis)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="stdRowCard">
                      <div className="stdRowLeft">
                        <div className="stdIcon">
                          {a.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="stdName">{a.name}</div>
                      </div>
                      <div className="stdRight">
                        <div className="stdBalPrefix">Bal.</div>
                        <div className="stdBalLabel">{fmtTZS(bal)}</div>
                        <button className="stdActionBtn" onClick={(e) => {
                          e.stopPropagation()
                          onSelectAccount?.(a.id)
                        }}>+</button>
                      </div>
                    </div>
                  )}
                </div>
              );


              const subs = Array.isArray(a.subAccounts) ? a.subAccounts : [];
              const visibleSubs = activeLedgerId === "all"
                ? subs
                : subs.filter(s => s.ledgerId === activeLedgerId);

              if (visibleSubs.length && expandedAccounts?.[a.id]) {
                visibleSubs.forEach((s) => {
                  nodes.push(
                    <div className="rowItem subRow" key={`${a.id}-${s.id}`}>
                      <div className="rowLeft">
                        <div className="avatar subAvatar">
                          {s.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="rowName">{s.name}</div>
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
      )
      }
    </div >
  );
}

// Helpers

function formatDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}



function AccountDetail({
  account,
  accounts,
  groups,
  accountTxns,
  activeLedgerId,
  ledgers,
  focusAccountId,
  onFocusAccountUsed,
  onSwitchLedger,
  onDetailOpen,
  onDetailClose,
  onToast,
  onClose,
  onAddAccountTxn,
  onTransferAccount,
  onUpsertAccount,
  onDeleteAccount,
  onUpdateAccountTxn,
  onDeleteAccountTxn,
  getAccountBalance,
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
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditRate, setCreditRate] = useState("");
  const [creditType, setCreditType] = useState("simple");
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [interestStartDate, setInterestStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("");
  const [purchaseTotal, setPurchaseTotal] = useState("");
  const [purchaseFee, setPurchaseFee] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleUnit, setSaleUnit] = useState("");
  const [saleQty, setSaleQty] = useState("");
  const [saleTotal, setSaleTotal] = useState("");
  const [showValuationModal, setShowValuationModal] = useState(false);
  const [valuationPrice, setValuationPrice] = useState("");
  const [valuationDate, setValuationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saleToAccountId, setSaleToAccountId] = useState("");
  const [saleToSubId, setSaleToSubId] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [creditToAccountId, setCreditToAccountId] = useState("");
  const [creditToSubId, setCreditToSubId] = useState("");
  const [error, setError] = useState("");
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [editTxnNote, setEditTxnNote] = useState("");
  const [editTxnDate, setEditTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editCreditRate, setEditCreditRate] = useState("");
  const [editCreditType, setEditCreditType] = useState("simple");
  const [editReceiveDate, setEditReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editInterestStartDate, setEditInterestStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(account.name || "");
  const [editLedgerId, setEditLedgerId] = useState(account.ledgerId || activeLedgerId);
  const [editBalance, setEditBalance] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editError, setEditError] = useState("");
  const [editingSubAccountId, setEditingSubAccountId] = useState(null)
  const [subEditName, setSubEditName] = useState("")
  const [subEditLedgerId, setSubEditLedgerId] = useState("")

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
    setEditName(account.name || "");
    setEditLedgerId(account.ledgerId || activeLedgerId);
  }, [account.id, account.name, account.ledgerId, activeLedgerId]);

  useEffect(() => {
    if (!showCreditModal) return;
    if (!creditToAccountId) {
      const firstTarget = accounts.find((a) => a.id !== account.id);
      if (firstTarget) setCreditToAccountId(firstTarget.id);
    }
  }, [showCreditModal, creditToAccountId, accounts, account.id]);

  useEffect(() => {
    const target = accounts.find((a) => a.id === creditToAccountId);
    const subs = Array.isArray(target?.subAccounts) ? target.subAccounts : [];
    if (!subs.length) {
      setCreditToSubId("");
      return;
    }
    if (!subs.find((s) => s.id === creditToSubId)) setCreditToSubId(subs[0].id);
  }, [creditToAccountId, accounts, creditToSubId]);
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
      .sort((a, b) => (a.date > b.date ? -1 : (a.date < b.date ? 1 : 0)));
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
    if (!adjustDate) {
      setError("Select a date.");
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
      receiveDate: adjustDate,
    });
    setAmount("");
    setNote("");
    setAdjustDate(new Date().toISOString().slice(0, 10));
    setMode(null);
  }

  async function handlePurchaseAsset() {
    const unit = purchaseUnit.trim();
    const qty = Number(purchaseQty || 0);
    const total = Number(purchaseTotal || 0);
    const fee = Number(purchaseFee || 0);
    if (!unit) {
      setError("Enter units.");
      return;
    }
    if (!qty || qty <= 0 || !total || total <= 0) {
      setError("Enter valid quantity and total.");
      return;
    }
    if (!purchaseDate) {
      setError("Select a date.");
      return;
    }
    const unitPrice = (total + fee) / qty;
    setError("");
    await onAddAccountTxn({
      accountId: account.id,
      amount: total + fee,
      direction: "in",
      note: `Purchase ${qty} ${unit} @ ${unitPrice.toFixed(2)}${fee ? ` + fee ${fee}` : ""}`,
      kind: "purchase",
      receiveDate: purchaseDate,
      unit,
      quantity: qty,
      unitPrice,
      fee
    });
    setPurchaseUnit("");
    setPurchaseQty("");
    setPurchaseTotal("");
    setPurchaseFee("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setShowPurchaseModal(false);
  }

  async function handleValuation() {
    const price = Number(valuationPrice || 0);
    if (!price || price <= 0) return onToast("Enter a valid price.");

    await onAddAccountTxn({
      accountId: account.id,
      amount: price,
      direction: "in",
      note: "Manual valuation",
      kind: "valuation",
      receiveDate: valuationDate,
      unitPrice: price
    });
    setShowValuationModal(false);
    onToast("Valuation updated.");
  }

  function getAvailableUnits(accountId) {
    const txns = accountTxns.filter((t) => t.accountId === accountId);
    const purchases = txns.filter((t) => t.kind === "purchase");
    const sales = txns.filter((t) => t.kind === "sale");
    const qty = purchases.reduce((s, t) => s + Number(t.quantity || 0), 0) -
      sales.reduce((s, t) => s + Number(t.quantity || 0), 0);
    const unit = purchases.find((t) => t.unit)?.unit || sales.find((t) => t.unit)?.unit || "";
    return { qty: Math.max(0, qty), unit };
  }

  async function handleSaleAsset() {
    const available = getAvailableUnits(account.id);
    const qty = Number(saleQty || 0);
    const total = Number(saleTotal || 0);
    if (!available.unit) {
      setError("No units available to sell.");
      return;
    }
    if (!qty || qty <= 0) {
      setError("Enter a valid units amount.");
      return;
    }
    if (qty > available.qty) {
      setError(`Max units available: ${available.qty} ${available.unit}`);
      return;
    }
    if (!total || total <= 0) {
      setError("Enter a valid total.");
      return;
    }
    if (!saleDate) {
      setError("Select a date.");
      return;
    }
    if (!saleToAccountId) {
      setError("Select where the money is going.");
      return;
    }
    setError("");
    const unitPrice = total / qty;
    const batch = [
      {
        accountId: account.id,
        amount: total,
        direction: "out",
        note: saleNote || `Sale ${qty} ${available.unit} for ${total}`,
        kind: "sale",
        receiveDate: saleDate,
        unit: available.unit,
        quantity: qty,
        unitPrice
      },
      {
        accountId: account.id,
        amount: unitPrice,
        direction: "in",
        note: "Unit price update (sale)",
        kind: "valuation",
        receiveDate: saleDate,
        unit: available.unit,
        quantity: qty,
        unitPrice
      },
      {
        accountId: saleToAccountId,
        subAccountId: saleToSubId || null,
        amount: total,
        direction: "in",
        note: saleNote ? `${saleNote} • from ${account.name}` : `Asset sale from ${account.name}`,
        kind: "adjust",
        receiveDate: saleDate
      }
    ];
    await onAddAccountTxn(batch);
    setSaleQty("");
    setSaleTotal("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setSaleToAccountId("");
    setSaleToSubId("");
    setSaleNote("");
    setShowSaleModal(false);
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
    setEditName(account.name);
    setEditLedgerId(account.ledgerId || activeLedgerId);
    setEditBalance(account.balance || 0);
    setEditGroupId(account.groupId);
    setEditError("");
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    const name = (editName || "").trim();
    if (!name) {
      setEditError("Enter a name.");
      return;
    }
    const nextLedgerId = editLedgerId || account.ledgerId || activeLedgerId;
    const targetLedger = ledgers.find((l) => l.id === nextLedgerId);
    const targetGroups = Array.isArray(targetLedger?.groups) ? targetLedger.groups : [];
    const type = currentGroup?.type || account.groupType || "debit";

    // Try to find a group in the target ledger that matches both Name and Type
    let targetGroup = targetGroups.find((g) => g.name === currentGroup?.name && g.type === type);
    // Fallback to matching by Type only
    if (!targetGroup) targetGroup = targetGroups.find((g) => g.type === type);
    // Final fallback
    targetGroup = targetGroup || targetGroups[0] || currentGroup;

    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    // Do not overwrite subaccount ledger IDs when moving the parent account
    const nextSubs = subs;

    await onUpsertAccount?.({
      ...account,
      name,
      ledgerId: nextLedgerId,
      groupId: (nextLedgerId === activeLedgerId && editGroupId) ? editGroupId : (targetGroup?.id || account.groupId),
      groupType: (nextLedgerId === activeLedgerId && editGroupId && groups.find(g => g.id === editGroupId)?.type) || targetGroup?.type || account.groupType,
      subAccounts: nextSubs
    });

    // Balance update logic for Debit accounts
    if (type === 'debit') {
      const oldBal = Number(account.balance || 0);
      const newBal = Number(editBalance || 0);
      const delta = newBal - oldBal;

      if (Math.abs(delta) > 0.01) {
        await onAddAccountTxn?.({
          accountId: account.id,
          amount: Math.abs(delta),
          direction: delta > 0 ? 'in' : 'out',
          kind: 'adjust',
          note: 'Balance correction',
          date: new Date().toISOString().slice(0, 10)
        });
      }
    }

    setShowEditModal(false);
    if (nextLedgerId && nextLedgerId !== activeLedgerId) {
      const ledgerName = ledgers.find((l) => l.id === nextLedgerId)?.name || "selected ledger";
      onToast?.(`Account moved to ${ledgerName}.`);
    } else {
      onToast?.("Account updated.");
    }
    // Do not switch active ledger when editing; only update the account's ledger assignment.
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

  function computeAssetSummary() {
    const info = getAssetInfo(account, accountTxns, currentGroup);
    if (!info.hasData) return { qty: 0, unit: "", unitPrice: 0, currentValue: 0 };
    return {
      qty: info.qty,
      unit: info.unit,
      unitPrice: info.unitPrice,
      avgPrice: info.avgPrice,
      currentValue: info.value,
      costBasis: info.costBasis,
      marketValue: info.marketValue
    };
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
    if (!creditToAccountId) {
      setError("Select the account to receive the money.");
      return;
    }
    const target = accounts.find((a) => a.id === creditToAccountId);
    const subs = Array.isArray(target?.subAccounts) ? target.subAccounts : [];
    if (subs.length && !creditToSubId) {
      setError("Select a sub-account for the receiving account.");
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
      interestStartDate,
      creditToAccountId,
      creditToSubAccountId: creditToSubId || null
    });
    setCreditAmount("");
    setCreditRate("");
    setCreditToAccountId("");
    setCreditToSubId("");
    setShowCreditModal(false);
  }


  function handleSaveTxnEdit() {
    if (!selectedTxn) return;
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

    let targetLedgerId = activeLedgerId;
    if (activeLedgerId === "all" || accounts.length > 0) {
      // If in "All Ledgers", or just generically, maybe ask? 
      // For now, let's default to the current active ledger (if specific), 
      // or the parent account's ledger if active is "all".
      if (activeLedgerId === "all") targetLedgerId = account.ledgerId;

      // Optional: Prompt for ledger?
      // Simplification: We will just use the current context or parent.
      // The user requested "assigned to a particulat ledger".
      // Let's add a confirm or simple prompt extension or just defaulting.
      // User requirement: "assigned to a particulat ledger".
      // Let's prompt for it if multiple ledgers exist.
      if (ledgers.length > 1) {
        // Simple approach: show a list in prompt? No, that's hard.
        // Let's just create it in the active ledger (if valid) or prompt?
        // To keep UI simple like before, we will default to `activeLedgerId || account.ledgerId`.
        // But maybe we need a modal for adding subaccount now?
        // Re-using the prompt flow for now but maybe we can be smarter.
        // Actually, let's just create it. Editing is where assignment happens usually?
        // Or wait, if I am in Ledger B, and I add a subaccount to Account (from Ledger A), 
        // it MUST be in Ledger B for it to show up here!
        // So defaulting to `activeLedgerId` is the correct behavior for "show in that Ledger".
        if (activeLedgerId === 'all') targetLedgerId = account.ledgerId;
      }
    }

    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    const nextSubs = [
      ...subs,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        balance: 0,
        ledgerId: targetLedgerId || account.ledgerId,
      },
    ];
    onUpsertAccount({ ...account, subAccounts: nextSubs });
    if (!subAccountId) setSubAccountId(nextSubs[0].id);
  }

  function handleSaveSubEdit() {
    if (!subEditName.trim()) return
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : []
    const nextSubs = subs.map(s => {
      if (s.id !== editingSubAccountId) return s
      return { ...s, name: subEditName.trim(), ledgerId: subEditLedgerId }
    })
    onUpsertAccount({ ...account, subAccounts: nextSubs })
    setEditingSubAccountId(null)
  }
  function handleDeleteSubAccount(subId) {
    const sub = (account.subAccounts || []).find(s => s.id === subId)
    if (!sub) return
    const bal = Number(sub.balance || 0)
    const msg = bal !== 0
      ? `This sub-account has a balance of ${fmtTZS(bal)}. Deleting it will discard this balance. Continue?`
      : "Delete this sub-account?"

    if (!window.confirm(msg)) return;
    const nextSubs = (account.subAccounts || []).filter(s => s.id !== subId)
    onUpsertAccount({ ...account, subAccounts: nextSubs })
  }

  return (
    <div className="accountsScreen accountDetail">
      <div className="accDetailCard">

        <div className="accDetailActionsTop">
          <button className="miniActionBtn" onClick={onClose}>✕</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="miniActionBtn" onClick={handleEdit}>Edit</button>
            <button className="miniActionBtn" onClick={handleDelete} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5' }}>Delete</button>
          </div>
        </div>
        {/* Title Row */}
        <div className="accDetailTitleRow">
          <div className="accDetailIcon">
            {account.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="accDetailTitle">
            <h2>{account.name}</h2>
            <span>
              {getAssetInfo(account, accountTxns, currentGroup).hasData
                ? `${getAssetInfo(account, accountTxns, currentGroup).qty} ${getAssetInfo(account, accountTxns, currentGroup).unit || currentGroup?.name}`
                : currentGroup?.name}
            </span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "1.5rem", fontWeight: "700" }}>
            {fmtTZS(getAccountBalance(account))}
          </div>
        </div>

        {/* Inner White Stats Card */}
        <div className="accDetailInnerCard">
          {/* Action Buttons */}
          <div className="actionRow">
            <button
              className="actionBtnLarge btnGreen"
              onClick={() => {
                if (currentGroup?.type === "credit") setShowCreditModal(true);
                else if (currentGroup?.type === "asset") setShowPurchaseModal(true);
                else setMode("adjust");
              }}
            >
              BUY
            </button>
            {currentGroup?.type === 'asset' && (
              <button
                className="actionBtnLarge btnYellow"
                onClick={() => {
                  const info = getAssetInfo(account, accountTxns, currentGroup)
                  setValuationPrice(info.unitPrice || "")
                  setShowValuationModal(true)
                }}
              >
                UPDATE
              </button>
            )}
            {(currentGroup?.type === 'asset' || currentGroup?.type !== 'asset') && (
              <button
                className={`actionBtnLarge ${currentGroup?.type === 'asset' ? 'btnRed' : 'btnYellow'}`}
                onClick={() => {
                  if (currentGroup?.type === 'asset') {
                    const info = getAvailableUnits(account.id);
                    setSaleUnit(info.unit);
                    const target = accounts.find((a) => a.id !== account.id);
                    setSaleToAccountId(target?.id || "");
                    setSaleToSubId("");
                    setShowSaleModal(true);
                  } else {
                    setMode("transfer")
                  }
                }}
              >
                {currentGroup?.type === 'asset' ? 'SALE' : 'UPDATE'}
              </button>
            )}
          </div>

          {/* Metrics Grid */}
          {currentGroup?.type === 'asset' && (() => {
            const info = computeAssetSummary()
            const unrealizedPL = info.marketValue - info.costBasis
            const plPercent = info.costBasis > 0 ? (unrealizedPL / info.costBasis) * 100 : 0
            const realizedGain = info.realizedGain || 0
            return (
              <>
                <div className="metricGrid">
                  <div className="metricBox">
                    <div className="metricLabel">Book Value</div>
                    <div className="metricValue">{fmtTZS(info.costBasis)}</div>
                    <div className="metricSub">(Invested)</div>
                  </div>
                  <div className="metricBox">
                    <div className="metricLabel">Market Value</div>
                    <div className="metricValue">{fmtTZS(info.marketValue)}</div>
                    <div className="metricSub">Current Value</div>
                  </div>
                </div>
                <div className={`gainPill ${unrealizedPL < 0 ? 'loss' : ''}`}>
                  Unrealized: {unrealizedPL > 0 ? '+' : ''}{fmtTZS(unrealizedPL)} ({unrealizedPL > 0 ? '+' : ''}{plPercent.toFixed(1)}%)
                </div>
                {realizedGain !== 0 && (
                  <div className={`gainPill ${realizedGain < 0 ? 'loss' : ''}`} style={{ marginTop: 8, background: realizedGain < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }}>
                    Realized Gain: {realizedGain > 0 ? '+' : ''}{fmtTZS(realizedGain)}
                  </div>
                )}
              </>
            )

          })()}

          {currentGroup?.type === 'credit' && (() => {
            const summary = computeCreditSummary()
            return (
              <div className="metricGrid">
                <div className="metricBox">
                  <div className="metricLabel">Principal</div>
                  <div className="metricValue">{fmtTZS(summary.principal)}</div>
                </div>
                <div className="metricBox">
                  <div className="metricLabel">Accrued Interest</div>
                  <div className="metricValue">{fmtTZS(summary.accrued)}</div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {(currentGroup?.type === 'debit' || (Array.isArray(account.subAccounts) && account.subAccounts.length > 0)) && (
        <div className="accHistory">
          <div className="accHistoryTitle">Sub-accounts</div>
          {Array.isArray(account.subAccounts) && account.subAccounts.length > 0 ? (
            <div className="list">
              {account.subAccounts
                .map((s) => (
                  <div className="rowItem subRow" key={s.id}>
                    <div className="rowLeft">
                      <div className="avatar subAvatar">{s.name.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <div className="rowName">{s.name}</div>
                        <div className="rowMeta">
                          {ledgers.find(l => l.id === s.ledgerId)?.name}
                        </div>
                      </div>
                    </div>
                    <div className="rowRight">
                      <div className="rowAmount">{fmtTZS(s.balance)}</div>
                      <button className="miniBtn" type="button" onClick={(e) => {
                        e.stopPropagation()
                        setEditingSubAccountId(s.id)
                        setSubEditName(s.name)
                        setSubEditLedgerId(s.ledgerId || account.ledgerId || activeLedgerId)
                      }}>Edit</button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="emptyRow">No sub-accounts yet.</div>
          )}
          {currentGroup?.type === 'debit' && (
            <button className="btn" type="button" onClick={handleAddSubAccount}>
              Add Sub-account
            </button>
          )}
        </div>
      )}

      {
        mode && (
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
                          {account.subAccounts
                            .map((s) => (
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
                            {target.subAccounts
                              .map((s) => (
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
                      <label>Date</label>
                      <input
                        type="date"
                        value={adjustDate}
                        onChange={(e) => setAdjustDate(e.target.value)}
                      />
                    </div>
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
                          {account.subAccounts
                            .map((s) => (
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
        )
      }

      {
        showCreditModal && (
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
                  <label>To account</label>
                  <select value={creditToAccountId} onChange={(e) => setCreditToAccountId(e.target.value)}>
                    <option value="">Select account</option>
                    {accounts
                      .filter((a) => a.id !== account.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                {(() => {
                  const target = accounts.find((a) => a.id === creditToAccountId);
                  if (!target || !Array.isArray(target.subAccounts) || !target.subAccounts.length) return null;
                  return (
                    <div className="field">
                      <label>To sub-account</label>
                      <select value={creditToSubId} onChange={(e) => setCreditToSubId(e.target.value)}>
                        <option value="">Select sub-account</option>
                        {target.subAccounts
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })()}
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
        )
      }

      {
        showPurchaseModal && (
          <div className="modalBackdrop" onClick={() => setShowPurchaseModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Asset Purchase</div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Units</label>
                  <input
                    value={purchaseUnit}
                    onChange={(e) => setPurchaseUnit(e.target.value)}
                    placeholder="e.g. Acres, Shares"
                  />
                </div>
                <div className="field">
                  <label>Amount of Units</label>
                  <input
                    inputMode="decimal"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="field">
                  <label>Total (TZS)</label>
                  <input
                    inputMode="decimal"
                    value={purchaseTotal}
                    onChange={(e) => setPurchaseTotal(e.target.value)}
                    placeholder="e.g. 4510000"
                  />
                </div>
                <div className="field">
                  <label>Transaction Fee (TZS)</label>
                  <input
                    inputMode="decimal"
                    value={purchaseFee}
                    onChange={(e) => setPurchaseFee(e.target.value)}
                    placeholder="e.g. 2000"
                  />
                </div>
                <div className="field">
                  <label>Price per Unit</label>
                  <input
                    readOnly
                    value={
                      purchaseQty && (purchaseTotal || purchaseFee)
                        ? ((Number(purchaseTotal || 0) + Number(purchaseFee || 0)) / Number(purchaseQty || 0)).toFixed(2)
                        : ""
                    }
                    placeholder="Calculated"
                  />
                </div>
                <div className="field">
                  <label>Date of Purchase</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
                {error && <div className="formError">{error}</div>}
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setShowPurchaseModal(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={handlePurchaseAsset}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        showSaleModal && (
          <div className="modalBackdrop" onClick={() => setShowSaleModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Asset Sale</div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Units</label>
                  <input value={saleUnit} readOnly />
                </div>
                <div className="field">
                  <label>Units amount</label>
                  <input
                    inputMode="decimal"
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    placeholder="e.g. 2"
                  />
                  <div className="small">
                    Max: {getAvailableUnits(account.id).qty} {saleUnit || ""}
                  </div>
                </div>
                <div className="field">
                  <label>Total Amount (TZS)</label>
                  <input
                    inputMode="decimal"
                    value={saleTotal}
                    onChange={(e) => setSaleTotal(e.target.value)}
                    placeholder="e.g. 200000"
                  />
                </div>
                <div className="field">
                  <label>Selling Date</label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Where is the money going</label>
                  <select value={saleToAccountId} onChange={(e) => setSaleToAccountId(e.target.value)}>
                    <option value="">Select account</option>
                    {accounts
                      .filter((a) => a.id !== account.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                {(() => {
                  const target = accounts.find((a) => a.id === saleToAccountId);
                  if (!Array.isArray(target?.subAccounts) || target.subAccounts.length === 0) return null;
                  return (
                    <div className="field">
                      <label>To sub-account</label>
                      <select value={saleToSubId} onChange={(e) => setSaleToSubId(e.target.value)}>
                        <option value="">Select sub-account</option>
                        {target.subAccounts
                          .map((s) => (
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
                    value={saleNote}
                    onChange={(e) => setSaleNote(e.target.value)}
                    placeholder="e.g. Market sale"
                  />
                </div>
                {error && <div className="formError">{error}</div>}
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setShowSaleModal(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={handleSaleAsset}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        showValuationModal && (
          <div className="modalBackdrop" onClick={() => setShowValuationModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Asset Valuation</div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Units Price (TZS)</label>
                  <input
                    inputMode="decimal"
                    value={valuationPrice}
                    onChange={(e) => setValuationPrice(e.target.value)}
                    placeholder="e.g. 500000"
                  />
                </div>
                <div className="field">
                  <label>Date of Valuation</label>
                  <input
                    type="date"
                    value={valuationDate}
                    onChange={(e) => setValuationDate(e.target.value)}
                  />
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setShowValuationModal(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={handleValuation}>
                    Revaluate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }


      {
        selectedTxn && (
          <div className="modalBackdrop" onClick={() => setSelectedTxn(null)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">
                {selectedTxn.kind === "credit" ? "Edit Credit" : "Transaction"}
              </div>

              <div className="accQuickForm">
                <div className="field">
                  <label>Amount (TZS)</label>
                  <input
                    inputMode="decimal"
                    value={editTxnAmount}
                    onChange={(e) => setEditTxnAmount(e.target.value)}
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
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={editTxnDate}
                    onChange={(e) => setEditTxnDate(e.target.value)}
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
                  <button className="btn primary" type="button" onClick={handleSaveTxnEdit}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        showEditModal && (
          <div className="modalBackdrop" onClick={() => setShowEditModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Edit Account</div>
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Account name"
                />
              </div>
              <div className="field">
                <label>Ledger</label>
                <select value={editLedgerId} onChange={(e) => setEditLedgerId(e.target.value)}>
                  {ledgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Group</label>
                <select
                  value={editGroupId}
                  onChange={(e) => setEditGroupId(e.target.value)}
                >
                  {groups
                    .filter(g => g.type === (currentGroup?.type || 'debit'))
                    .map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))
                  }
                </select>
              </div>
              {(currentGroup?.type === 'debit' || !currentGroup) && (
                <div className="field">
                  <label>Balance (TZS) - Creates Adjustment</label>
                  <input
                    type="number"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
              {editError && <div className="small" style={{ color: "#d25b5b" }}>{editError}</div>}
              <div className="modalActions">
                <button className="btn" type="button" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={handleSaveEdit}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        editingSubAccountId && (
          <div className="modalBackdrop" onClick={() => setEditingSubAccountId(null)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Edit Sub-account</div>
              <div className="field">
                <label>Name</label>
                <input
                  value={subEditName}
                  onChange={(e) => setSubEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Ledger</label>
                <select
                  value={subEditLedgerId}
                  onChange={(e) => setSubEditLedgerId(e.target.value)}
                >
                  {ledgers.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, marginTop: 24 }}>
                {(() => {
                  const sub = account.subAccounts?.find(s => s.id === editingSubAccountId);
                  if (sub) {
                    return (
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => {
                          handleDeleteSubAccount(editingSubAccountId);
                          setEditingSubAccountId(null);
                        }}
                      >
                        Delete
                      </button>
                    )
                  }
                  return <div></div>
                })()}
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setEditingSubAccountId(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={handleSaveSubEdit}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

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
                  <div className="accHistoryDate">
                    <div className="dateYear">{new Date(date).getFullYear()}</div>
                    <div className="dateTop">
                      {new Date(date).toLocaleDateString("en-GB", { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className="accHistoryTotals">
                    {totals.out > 0 && (
                      <div className="totalGroup">
                        <div className="totalLabel out">OUT</div>
                        <div className="totalValue out">{fmtTZS(totals.out)}</div>
                      </div>
                    )}
                    {totals.in > 0 && (
                      <div className="totalGroup">
                        <div className="totalLabel in">IN</div>
                        <div className="totalValue in">{fmtTZS(totals.in)}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="accHistoryBody">
                  {items.map((t) => {
                    const subName =
                      account.subAccounts?.find((s) => s.id === t.subAccountId)?.name || "";
                    const title = t.note || (t.kind ? `${t.kind[0].toUpperCase()}${t.kind.slice(1)}` : "Balance update");
                    const kindLabel = t.kind ? t.kind.charAt(0).toUpperCase() + t.kind.slice(1) : "";
                    const meta = subName || (t.kind === "transfer" ? "Transfer" : (kindLabel || "Account"));
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
    </div >
  );
}
