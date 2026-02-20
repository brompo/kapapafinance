import React, { useEffect, useMemo, useState } from "react";
import { fmtTZS, fmtCompact, calculateAssetMetrics } from "../money.js";

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
  settings = {},
  onUpdateSettings,
  categories = {}, // { income: [], expense: [] }
  txns = [] // Ledger transactions for return calc
}) {
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editTargetYear, setEditTargetYear] = useState("");
  const [filter, setFilter] = useState("all"); // all | debit | credit | asset
  const [selectedId, setSelectedId] = useState(null);
  const [draggingGroupId, setDraggingGroupId] = useState(null);
  const [draggingAccountId, setDraggingAccountId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [showOverview, setShowOverview] = useState(true);
  const [viewMode, setViewMode] = useState("accounts"); // accounts | growth
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
      // If account has subaccounts, trust the base sum (which filters subs by ledger)
      if (subs.length > 0) return base;
      const info = calculateAssetMetrics(account, accountTxns, groupType);
      if (info.hasData && info.unitPrice > 0) return info.value;
    }

    // Default fallback (cash balance)
    // If we have sub-accounts, we trust the base sum (which filters subs by ledger)
    if (subs.length > 0) return base;

    // Otherwise, check if the parent account belongs to the active ledger
    if (activeLedgerId !== "all" && account.ledgerId !== activeLedgerId) return 0;
    return base;
  }


  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let capitalDeployed = 0;
    let invested = 0;

    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = g?.type;
      const val = getAccountBalance(a); // Market Value

      if (type === "credit") {
        liabilities += val;
        capitalDeployed -= val;
      } else if (type === "asset") {
        assets += val;
        const info = calculateAssetMetrics(a, accountTxns, g.type);
        capitalDeployed += (info.costBasis || 0);
        invested += (info.costBasis || 0);
      } else {
        // Debit
        assets += val;
        capitalDeployed += val;
        invested += val;
      }
    }

    // --- Capital Coverage Metrics ---
    // 1. Monthly Return (Avg last 3 months)
    const now = new Date();
    let totalProfit3m = 0;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    const iso3m = threeMonthsAgo.toISOString().slice(0, 10);

    // Filter txns for income/expense in last 3 months
    // Note: txns prop passed from App.jsx contains all ledger txns
    const recentTxns = txns.filter(t => t.date >= iso3m);
    let income3m = 0;
    let expense3m = 0;
    for (const t of recentTxns) {
      const amt = Number(t.amount || 0);
      if (t.type === 'income') income3m += amt;
      else if (t.type === 'expense') expense3m += amt;
    }
    const avgMonthlyProfit = (income3m - expense3m) / 3;
    const monthlyReturn = capitalDeployed > 0 ? (avgMonthlyProfit / capitalDeployed) * 100 : 0;

    // 2. Cost of Capital (Weighted Avg Monthly Interest)
    let totalDebt = 0;
    let totalWeightedRate = 0;
    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      if (g?.type === 'credit') {
        const bal = getAccountBalance(a); // This includes accrued
        // We need the rate. It's on the account object, usually 'creditRate' (annual %)
        // If not present, assume 0.
        const rate = Number(a.creditRate || 0);
        if (bal > 0) {
          totalDebt += bal;
          totalWeightedRate += (bal * (rate / 12)); // Monthly rate weight
        }
      }
    }
    const costOfCapital = totalDebt > 0 ? (totalWeightedRate / totalDebt) : 0; // Monthly %

    // 3. Coverage
    const coverage = costOfCapital > 0 ? (monthlyReturn / costOfCapital) : (totalDebt > 0 ? 0 : 999);

    return {
      assets,
      liabilities,
      netWorth: assets - liabilities,
      capitalDeployed,
      invested, // Total Invested Capital (Cash + Asset Cost Basis)
      monthlyReturn,
      costOfCapital,
      coverage
    };
  }, [visibleAccounts, groupById, activeLedgerId, accountTxns, txns]);


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
        categories={categories}
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
            <div className="netWorthTargetText" style={{ justifyContent: 'center', marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>
              {settings.netWorthTarget ? (
                <span>Target: {fmtCompact(settings.netWorthTarget)} by {settings.netWorthTargetYear || '2029'}</span>
              ) : (
                <span>Set Target</span>
              )}
              <button className="netWorthEditBtn" style={{ color: 'white' }} onClick={(e) => {
                e.stopPropagation();
                setEditTargetValue(settings.netWorthTarget || "");
                setEditTargetYear(settings.netWorthTargetYear || "2029");
                setTargetModalOpen(true);
              }}>✎</button>
            </div>
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
          {/* Top Metrics Cards */}

          {/* View Tabs */}
          <div className="viewTabs">
            <button
              className={`viewTab ${viewMode === 'accounts' ? 'active' : ''}`}
              onClick={() => setViewMode('accounts')}
            >
              Accounts
            </button>
            <button
              className={`viewTab ${viewMode === 'growth' ? 'active' : ''}`}
              onClick={() => setViewMode('growth')}
            >
              Growth Insights
            </button>
          </div>

          {/* Growth View */}
          {viewMode === 'growth' && (
            <>
              <div className="topMetricsRow">
                <div className="topMetricCard">
                  <div className="topMetricLabel">Capital Efficiency</div>
                  <div className="topMetricValue" style={{ color: '#16A34A' }}>
                    {(() => {
                      const profit = totals.netWorth - totals.capitalDeployed;
                      const roi = totals.capitalDeployed > 0 ? (profit / totals.capitalDeployed) * 100 : 0;
                      return (
                        <>
                          {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                          <span className="trendIcon">{roi >= 0 ? '↑' : '↓'}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="topMetricSub">
                    Return on Capital
                  </div>
                </div>
                <div className="topMetricCard">
                  <div className="topMetricLabel">Capital Coverage</div>
                  <div className="topMetricValue" style={{
                    color: totals.coverage >= 1.5 ? '#16A34A' : (totals.coverage >= 1 ? '#EAB308' : '#DC2626')
                  }}>
                    {totals.coverage > 100 ? '∞' : totals.coverage.toFixed(2) + 'x'}
                  </div>
                  <div className="topMetricSub" style={{ marginBottom: 2 }}>
                    {totals.coverage >= 1.5 ? 'Safe to Leverage' : (totals.coverage >= 1 ? 'Caution' : 'Critical')}
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 'auto', display: 'flex', gap: 8 }}>
                    <span>Ret: {totals.monthlyReturn.toFixed(1)}%</span>
                    <span>Cost: {totals.costOfCapital.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="topMetricCard">
                  <div className="topMetricLabel">Source of Capital</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {(() => {
                      const selfFunded = Math.max(0, totals.invested - totals.liabilities);
                      const selfPct = totals.invested > 0 ? (selfFunded / totals.invested) * 100 : 0;
                      const creditPct = totals.invested > 0 ? (totals.liabilities / totals.invested) * 100 : 0;
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: '#6b7280' }}>Self Funded</span>
                            <span style={{ fontWeight: 600 }}>{selfPct.toFixed(0)}%</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${selfPct}%`, background: '#10B981' }} />
                            <div style={{ width: `${creditPct}%`, background: '#EF4444' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: '#6b7280' }}>Credit</span>
                            <span style={{ fontWeight: 600 }}>{creditPct.toFixed(0)}%</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                <div className="overviewTitle" style={{ marginTop: 0 }}>Capital Allocation</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>{fmtTZS(totals.invested)}</div>
              </div>
              <div className="allocationGrid">
                {groups.filter(g => g.type === 'asset' || g.type === 'debit').map(g => {
                  const groupAccounts = visibleAccounts.filter(a => a.groupId === g.id);
                  if (groupAccounts.length === 0) return null;

                  let displayValue = 0;
                  if (g.type === 'asset') {
                    // For Capital Allocation, user wants Book Value (Cost Basis)
                    displayValue = groupAccounts.reduce((sum, a) => {
                      const info = calculateAssetMetrics(a, accountTxns, g.type);
                      return sum + (info.costBasis || 0);
                    }, 0);
                  } else {
                    // For Debit (Cash), value is the balance
                    displayValue = groupAccounts.reduce((sum, a) => sum + getAccountBalance(a), 0);
                  }

                  // Denominator is Total Invested Capital (Cash + Asset Cost Basis)
                  const allocation = totals.invested > 0 ? (displayValue / totals.invested) * 100 : 0;

                  // Performance is still Market Value vs Cost Basis
                  const currentMarketValue = groupAccounts.reduce((sum, a) => sum + getAccountBalance(a), 0);
                  const costBasis = (g.type === 'asset') ? displayValue : currentMarketValue;
                  const profit = currentMarketValue - costBasis;
                  const perf = costBasis > 0 ? (profit / costBasis) * 100 : 0;

                  return (
                    <div className="allocationRow" key={g.id}>
                      <div className="allocLeft">
                        <div className="allocName">{g.name}</div>
                        <div className="allocPerf" style={{ color: perf >= 0 ? '#16A34A' : '#DC2626' }}>
                          {g.type === 'asset' && costBasis > 0 ? (
                            <>{perf > 0 ? '+' : ''}{perf.toFixed(1)}%</>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>-</span>
                          )}
                        </div>
                      </div>
                      <div className="allocRight">
                        <div className="allocValue">{fmtTZS(displayValue)}</div>
                        <div className="allocSub">{allocation.toFixed(1)}% of Invested</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {targetModalOpen && (
            <div className="modalBackdrop" onClick={() => setTargetModalOpen(false)}>
              <div className="modalCard" onClick={(e) => e.stopPropagation()}>
                <div className="modalTitle">Set Net Worth Target</div>
                <div className="accQuickForm">
                  <div className="field">
                    <label>Target Amount (TZS)</label>
                    <input
                      inputMode="decimal"
                      value={editTargetValue}
                      onChange={(e) => setEditTargetValue(e.target.value)}
                      placeholder="e.g. 1000000000"
                    />
                  </div>
                  <div className="field">
                    <label>Target Year</label>
                    <input
                      inputMode="numeric"
                      value={editTargetYear}
                      onChange={(e) => setEditTargetYear(e.target.value)}
                      placeholder="e.g. 2029"
                    />
                  </div>
                  <div className="btnRow">
                    <button className="btn" onClick={() => setTargetModalOpen(false)}>Cancel</button>
                    <button className="btn primary" onClick={() => {
                      onUpdateSettings({
                        ...settings,
                        netWorthTarget: editTargetValue,
                        netWorthTargetYear: editTargetYear
                      });
                      setTargetModalOpen(false);
                    }}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}


      {/* Accounts View */}
      {viewMode === 'accounts' && shownGroups.map((group) => {
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
            expandedAccounts={expandedAccounts}
            onToggleAccountExpand={toggleAccountExpand}
            activeLedgerId={activeLedgerId}
            categories={categories}
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
                              const info = calculateAssetMetrics(a, accountTxns, group.type)
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
                          Invested: {fmtTZS(calculateAssetMetrics(a, accountTxns, group.type).costBasis)}
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
  categories,
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
  const [fromAccountId, setFromAccountId] = useState(account.id);
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
  const [saleCategory, setSaleCategory] = useState("");
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
    if (!saleCategory) {
      setError("Select an Income Category.");
      return;
    }
    setError("");
    const unitPrice = total / qty;
    const linkId = `sale-${Date.now()}`;
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
        unitPrice,
        category: saleCategory,
        linkId
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
        unitPrice,
        linkId
      },
      {
        accountId: saleToAccountId,
        subAccountId: saleToSubId || null,
        amount: total,
        direction: "in",
        note: saleNote ? `${saleNote} • from ${account.name}` : `Asset sale from ${account.name}`,
        kind: "adjust",
        receiveDate: saleDate,
        linkId
      }
    ];
    await onAddAccountTxn(batch);
    setSaleQty("");
    setSaleTotal("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    setSaleToAccountId("");
    setSaleToSubId("");
    setSaleNote("");
    setSaleCategory("");
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
    if (targetId === fromAccountId && subAccountId === targetSubId) {
      setError("Select a different sub-account.");
      return;
    }
    setError("");
    await onTransferAccount({
      fromId: fromAccountId,
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
    const info = calculateAssetMetrics(account, accountTxns, currentGroup?.type);
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
              {calculateAssetMetrics(account, accountTxns, currentGroup?.type).hasData
                ? `${calculateAssetMetrics(account, accountTxns, currentGroup?.type).qty} ${calculateAssetMetrics(account, accountTxns, currentGroup?.type).unit || currentGroup?.name}`
                : currentGroup?.name}
            </span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "1.5rem", fontWeight: "700" }}>
            {fmtTZS(
              Array.isArray(account.subAccounts) && account.subAccounts.length > 0
                ? account.subAccounts.reduce((s, sub) => s + Number(sub.balance || 0), 0)
                : getAccountBalance(account)
            )}
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
              {currentGroup?.type === 'asset' ? 'BUY' : currentGroup?.type === 'credit' ? 'BORROW' : 'ADD'}
            </button>
            {currentGroup?.type === 'asset' && (
              <button
                className="actionBtnLarge btnYellow"
                onClick={() => {
                  const info = calculateAssetMetrics(account, accountTxns, currentGroup?.type)
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
                {currentGroup?.type === 'asset' ? 'SALE' : 'TRANSFER'}
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
                      <select value={fromAccountId} onChange={(e) => {
                        setFromAccountId(e.target.value)
                        const acct = accounts.find(a => a.id === e.target.value)
                        const subs = acct && Array.isArray(acct.subAccounts) ? acct.subAccounts : []
                        setSubAccountId(subs.length ? subs[0].id : '')
                      }}>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const fromAcct = accounts.find(a => a.id === fromAccountId)
                      const fromSubs = fromAcct && Array.isArray(fromAcct.subAccounts) ? fromAcct.subAccounts : []
                      if (!fromSubs.length) return null
                      return (
                        <div className="field">
                          <label>From sub-account</label>
                          <select value={subAccountId} onChange={(e) => setSubAccountId(e.target.value)}>
                            <option value="">Select</option>
                            {fromSubs.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })()}

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
                <div className="field">
                  <label>Income Category for Gain</label>
                  <select
                    value={saleCategory}
                    onChange={(e) => setSaleCategory(e.target.value)}
                  >
                    <option value="">Select Category</option>
                    {categories?.income?.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
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
