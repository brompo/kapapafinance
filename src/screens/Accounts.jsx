import React, { useEffect, useMemo, useState } from "react";
import { fmtTZS, fmtCompact, calculateAssetMetrics, calculateSavingsMetrics, computeAccountBalance, calculateBucketSpentYTD } from "../money.js";
import AccountDetail from "./AccountDetail";

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
  allAccounts = [],
  accountTxns = [],
  groups = [],
  focusAccountId,
  onFocusAccountUsed,
  onDetailOpen,
  onDetailClose,
  onToast,
  onUpsertAccount,
  onDeleteAccount,
  onMergeAccounts,
  onAddAccountTxn,
  onIssueLoan,
  onTransferAccount,
  onPayCreditBack,
  onUpdateAccountTxn,
  onUpdateAccountTxnMeta,
  onDeleteAccountTxn,
  onUpdateGroups,
  onUpdateAccounts,
  onReallocateBuckets,
  onMarkDueFrom,
  onUnmarkDueFrom,
  onSettleDueFrom,
  settings = {},
  onUpdateSettings,
  categories = {}, // { income: [], expense: [] }
  txns = [], // Ledger transactions for return calc
  clients = [], // Global list of clients
}) {
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editTargetYear, setEditTargetYear] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draggingGroupId, setDraggingGroupId] = useState(null);
  const [draggingAccountId, setDraggingAccountId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [dragOverAccountId, setDragOverAccountId] = useState(null);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState('debit');
  const [newGroupMetaCategory, setNewGroupMetaCategory] = useState('wallet');
  const [collapsedMetaSections, setCollapsedMetaSections] = useState({});
  const [showOverview, setShowOverview] = useState(true);
  const [showImportantNumbers, setShowImportantNumbers] = useState(true);
  const [viewMode, setViewMode] = useState("accounts"); // accounts | growth
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [addingToGroup, setAddingToGroup] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [editMetaCategory, setEditMetaCategory] = useState("");

  function renderMetaSection(label, type, total, groups) {
    const isCollapsed = !!collapsedMetaSections[type];
    const toggleCollapse = () => {
      setCollapsedMetaSections(prev => ({ ...prev, [type]: !prev[type] }));
    };

    return (
      <div className={`metaSection ${isCollapsed ? 'collapsed' : ''}`} key={type}>
        <div className="metaHeader" onClick={toggleCollapse} style={{ cursor: 'pointer' }}>
          <div className="metaInfo">
            <span className="metaLabel">{label}</span>
            <span className="metaDesc">
              {type === 'wallet' && 'The "Now" Money'}
              {type === 'asset' && 'The "Growth" Engine'}
              {type === 'obligations' && 'Receivables & Payables'}
              {type === 'savings' && 'The "Purpose" Money'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={`metaTotal ${total < 0 ? 'neg' : (total > 0 && type === 'obligations' ? 'pos' : '')}`}>
              {fmtTZS(total)}
            </div>
            <button
              className="metaAddBtn"
              type="button"
              title="Add Group to this Section"
              onClick={(e) => {
                e.stopPropagation();
                setNewGroupMetaCategory(type);
                if (type === 'wallet') setNewGroupType('debit');
                else if (type === 'asset') setNewGroupType('asset');
                else if (type === 'obligations') setNewGroupType('credit');
                else if (type === 'savings') setNewGroupType('debit');
                setNewGroupName('');
                setShowAddGroupModal(true);
              }}
            >
              +
            </button>
            <div className="metaChevron" style={{ fontSize: 16, opacity: 0.6, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>
              ▾
            </div>
          </div>
        </div>

        {!isCollapsed && (
          <div className="metaBody">
            {groups.map(group => {
              const items = visibleAccounts.filter((a) => a.groupId === group.id);
              const isSavings = type === 'savings';
              const total = items.reduce((s, a) => {
                const bal = getAccountBalance(a);
                return s + bal;
              }, 0);
              const right = (group.type === "credit" || group.type === "loan") ? `Owed ${fmtTZS(total)}` : `Bal. ${fmtTZS(total)}`;
              return (
                <Section
                  key={group.id}
                  group={group}
                  metaCategory={type}
                  accountTxns={accountTxns}
                  accounts={accounts}
                  right={right}
                  total={total}
                  items={items}
                  onDeleteAccount={onDeleteAccount}
                  onSelectAccount={(id) => setSelectedId(id)}
                  onToggleCollapse={() => toggleGroupCollapse(group)}
                  onEditGroup={() => {
                    setEditingGroup(group);
                    setEditGroupName(group.name);
                    setEditMetaCategory(group.metaCategory || type);
                  }}
                  onAddAccount={() => handleAddAccount(group)}
                  onMoveGroupUp={() => handleMoveGroupUp(group.id)}
                  onMoveGroupDown={() => handleMoveGroupDown(group.id)}
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
                  categories={categories}
                />
              )
            })}
          </div>
        )}
      </div>
    );
  }

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



  function getAccountBalance(account, balanceType = 'current', ignoreLedgerFilter = false) {
    return computeAccountBalance(account, accountTxns, groups, balanceType, ignoreLedgerFilter);
  }


  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    let capitalDeployed = 0;
    let invested = 0;
    let loanBook = 0;
    let liquidCash = 0;
    let assetCost = 0;
    let assetValue = 0;
    let landCapital = 0;
    let landValue = 0;
    let landRealizedGains = 0;
    let sharesCapital = 0;
    let sharesValue = 0;
    let sharesRealizedGains = 0;
    let totalRealizedGains = 0;
    let totalDebt = 0;

    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = a.accountType || g?.type;
      const val = getAccountBalance(a); // Market Value

      if (type === "credit") {
        if (val >= 0) {
          liabilities += val;
          totalDebt += val;
          capitalDeployed -= val;
        } else {
          assets += Math.abs(val);
          capitalDeployed += Math.abs(val);
        }
      } else if (type === "loan") {
        if (val >= 0) {
          assets += val;
          loanBook += val;
          capitalDeployed += val;
          invested += val;
        } else {
          liabilities += Math.abs(val);
          totalDebt += Math.abs(val);
          capitalDeployed -= Math.abs(val);
        }
      } else if (type === "asset") {
        if (val >= 0) {
          assets += val;
          const info = calculateAssetMetrics(a, accountTxns, 'asset');
          capitalDeployed += (info.costBasis || 0);
          invested += (info.costBasis || 0);
          assetCost += (info.costBasis || 0);
          assetValue += val;
          totalRealizedGains += (info.realizedGain || 0);
          // Classify as land or shares based on account name AND group name
          const name = (a.name || '').toLowerCase();
          const gName = (g?.name || '').toLowerCase();
          const isLand = ['land', 'plot', 'property', 'shamba', 'farm', 'estate', 'real estate'].some(k => name.includes(k) || gName.includes(k));
          if (isLand) {
            landCapital += (info.costBasis || 0);
            landValue += val;
            landRealizedGains += (info.realizedGain || 0);
          } else {
            sharesCapital += (info.costBasis || 0);
            sharesValue += val;
            sharesRealizedGains += (info.realizedGain || 0);
          }
        } else {
          liabilities += Math.abs(val);
          totalDebt += Math.abs(val);
        }
      } else {
        // Debit
        if (val >= 0) {
          assets += val;
          capitalDeployed += val;
          invested += val;
        } else {
          liabilities += Math.abs(val);
          totalDebt += Math.abs(val);
          capitalDeployed -= Math.abs(val);
        }
        liquidCash += val;
      }
    }

    const productiveCapital = assetCost + loanBook;
    const idleCash = Math.max(0, liquidCash - loanBook);
    const netWorth = assets - liabilities;
    const friendLoanExposure = netWorth > 0 ? (loanBook / netWorth) * 100 : 0;

    // --- Capital Coverage Metrics ---
    // 1. Monthly Return (Avg last 3 months)
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    const iso3m = threeMonthsAgo.toISOString().slice(0, 10);

    // Ledger income/expense
    const recentTxns = txns.filter(t => t.date >= iso3m);
    let income3m = 0;
    let expense3m = 0;
    for (const t of recentTxns) {
      const amt = Number(t.amount || 0);
      if (t.type === 'income') income3m += amt;
      else if (t.type === 'expense') expense3m += amt;
    }

    // Also include realized gains from asset sales in the last 3 months
    let recentRealizedGains = 0;
    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = a.accountType || g?.type;
      if (type === 'asset') {
        const info = calculateAssetMetrics(a, accountTxns, 'asset');
        if (info.realizedGains) {
          for (const rg of info.realizedGains) {
            if (rg.date >= iso3m) recentRealizedGains += (rg.amount || 0);
          }
        }
      }
    }

    const avgMonthlyProfit = (income3m - expense3m + recentRealizedGains) / 3;
    const monthlyReturn = capitalDeployed > 0 ? (avgMonthlyProfit / capitalDeployed) * 100 : 0;

    // YTD Profit computation
    const currentYearStr = String(now.getFullYear());
    const ytdTxns = txns.filter(t => t.date && t.date.startsWith(currentYearStr));
    let ytdIncome = 0;
    let ytdExpense = 0;
    for (const t of ytdTxns) {
      const amt = Number(t.amount || 0);
      if (t.type === 'income') ytdIncome += amt;
      else if (t.type === 'expense') ytdExpense += amt;
    }
    let ytdRealizedGains = 0;
    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = a.accountType || g?.type;
      if (type === 'asset') {
        const info = calculateAssetMetrics(a, accountTxns, 'asset');
        if (info.realizedGains) {
          for (const rg of info.realizedGains) {
            if (rg.date && rg.date.startsWith(currentYearStr)) ytdRealizedGains += (rg.amount || 0);
          }
        }
      }
    }
    const profitYTD = ytdIncome - ytdExpense + ytdRealizedGains;

    // 2. Cost of Capital (Weighted Avg Monthly Interest)
    let totalWeightedRate = 0;
    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = a.accountType || g?.type;
      if (type === 'credit') {
        const bal = getAccountBalance(a);
        const rate = Number(a.creditRate || 0);
        if (bal > 0) {
          totalWeightedRate += (bal * (rate / 12));
        }
      }
    }
    const costOfCapital = totalDebt > 0 ? (totalWeightedRate / totalDebt) : 0;
    const costOfDebtAnnual = costOfCapital * 12;

    // 3. Coverage
    const coverage = costOfCapital > 0 ? (monthlyReturn / costOfCapital) : (totalDebt > 0 ? 0 : 999);

    // ROC = annualized monthly return
    const roc = monthlyReturn * 12;
    // ROBC = ROC / Cost of Debt
    const robc = costOfDebtAnnual > 0 ? (roc / costOfDebtAnnual) : 0;
    // Capital Turns
    const capitalTurns = productiveCapital > 0 ? (totalRealizedGains / productiveCapital) : 0;

    return {
      assets,
      liabilities,
      netWorth,
      capitalDeployed,
      invested,
      monthlyReturn,
      costOfCapital,
      costOfDebtAnnual,
      coverage,
      loanBook,
      liquidCash,
      idleCash,
      assetCost,
      assetValue,
      productiveCapital,
      friendLoanExposure,
      totalDebt,
      totalRealizedGains,
      sharesValue,
      sharesRealizedGains,
      profitYTD,
      walletsBal: visibleAccounts.filter(a => (groupById.get(a.groupId)?.metaCategory === 'wallet')).reduce((s, a) => s + getAccountBalance(a), 0),
      assetsBal: visibleAccounts.filter(a => (groupById.get(a.groupId)?.metaCategory === 'asset')).reduce((s, a) => s + getAccountBalance(a), 0),
      debtBal: visibleAccounts.filter(a => {
        const mc = groupById.get(a.groupId)?.metaCategory;
        return mc === 'obligations' || mc === 'debt';
      }).reduce((s, a) => {
        const bal = getAccountBalance(a);
        // Use groupType to ensure we detect credit accounts correctly
        const type = a.groupType || groupById.get(a.groupId)?.type;
        if (type === 'credit') return s - bal;
        return s + bal;
      }, 0),
      savingsBal: visibleAccounts.filter(a => (groupById.get(a.groupId)?.metaCategory === 'savings')).reduce((s, a) => s + getAccountBalance(a), 0),
    };
  }, [visibleAccounts, groupById, accountTxns, txns]);


  const metaGroups = useMemo(() => {
    const map = { wallet: [], obligations: [], asset: [], savings: [] };
    groups.forEach(g => {
      let cat = g.metaCategory;
      if (cat === 'debt') cat = 'obligations'; // migration
      if (!cat) {
        cat = (g.type === 'credit' || g.type === 'loan') ? 'obligations' : (g.type === 'asset' ? 'asset' : 'wallet');
      }
      if (map[cat]) map[cat].push(g);
      else map.wallet.push(g); // Fallback
    });
    return map;
  }, [groups]);

  function handleAddGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const next = [
      ...groups,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        type: newGroupType,
        metaCategory: newGroupMetaCategory,
        collapsed: false
      },
    ];
    onUpdateGroups?.(next);
    setNewGroupName('');
    setNewGroupType('debit');
    setNewGroupMetaCategory('wallet');
    setShowAddGroupModal(false);
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
    });
    setAddingToGroup(null);
  }

  function handleSaveEditGroup() {
    const trimmed = editGroupName.trim();
    if (!trimmed || !editingGroup) return;
    const next = groups.map((g) => (g.id === editingGroup.id
      ? { ...g, name: trimmed, metaCategory: editMetaCategory }
      : g
    ));
    onUpdateGroups?.(next);
    setEditingGroup(null);
  }

  function handleDeleteGroup(groupId) {
    if (!confirm(`Delete group "${editingGroup.name}"?`)) return;
    onUpdateGroups?.(groups.filter(g => g.id !== groupId));
    setEditingGroup(null);
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

  function handleMoveGroupUp(id) {
    const index = groups.findIndex((g) => g.id === id);
    if (index > 0) {
      const next = [...groups];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      onUpdateGroups?.(next);
    }
  }

  function handleMoveGroupDown(id) {
    const index = groups.findIndex((g) => g.id === id);
    if (index >= 0 && index < groups.length - 1) {
      const next = [...groups];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      onUpdateGroups?.(next);
    }
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

    const sourceMeta = sourceGroup?.metaCategory || sourceGroup?.type;
    const targetMeta = targetGroup?.metaCategory || targetGroup?.type;

    if (sourceMeta !== targetMeta && sourceGroup?.type !== targetGroup?.type) {
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

    const sourceMeta = sourceGroup?.metaCategory || sourceGroup?.type;
    const targetMeta = targetGroup?.metaCategory || targetGroup?.type;

    if (sourceMeta !== targetMeta && sourceGroup?.type !== targetGroup?.type) {
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
        allAccounts={allAccounts}
        groups={groups}
        accountTxns={accountTxns}
        categories={categories}
        onClose={() => setSelectedId(null)}
        getAccountBalance={getAccountBalance}
        onAddAccountTxn={onAddAccountTxn}
        onIssueLoan={onIssueLoan}
        onTransferAccount={onTransferAccount}
        onPayCreditBack={onPayCreditBack}
        onUpsertAccount={onUpsertAccount}
        onDeleteAccount={onDeleteAccount}
        onMergeAccounts={onMergeAccounts}
        onUpdateAccountTxn={onUpdateAccountTxn}
        onUpdateAccountTxnMeta={onUpdateAccountTxnMeta}
        onDeleteAccountTxn={onDeleteAccountTxn}
        onReallocateBuckets={onReallocateBuckets}
        onMarkDueFrom={onMarkDueFrom}
        onUnmarkDueFrom={onUnmarkDueFrom}
        onSettleDueFrom={onSettleDueFrom}
        onToast={onToast}
        clients={clients}
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

      {editingGroup && (
        <div className="modalBackdrop" onClick={() => setEditingGroup(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Edit Account Group</div>
            <div className="accQuickForm">
              <div className="field">
                <label>Group Name</label>
                <input
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="e.g. Savings"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Meta Category (Section)</label>
                <select
                  value={editMetaCategory}
                  onChange={(e) => setEditMetaCategory(e.target.value)}
                >
                  <option value="wallet">WALLETS (Operational)</option>
                  <option value="obligations">OBLIGATIONS (Receivables & Payables)</option>
                  <option value="asset">ASSETS (Growth)</option>
                  <option value="savings">SAVINGS (Purpose)</option>
                </select>
              </div>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => handleDeleteGroup(editingGroup.id)}
                  disabled={visibleAccounts.some(a => a.groupId === editingGroup.id)}
                  title={visibleAccounts.some(a => a.groupId === editingGroup.id) ? "Cannot delete group with accounts inside" : "Delete group"}
                >
                  Delete Group
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setEditingGroup(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={handleSaveEditGroup}
                    disabled={!editGroupName.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overviewTitle"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>

        {/* Left: spacer to balance the layout (no ledger picker anymore) */}
        <div style={{ justifyContent: 'flex-start', width: 60 }} />

        {/* Center: Financial Overview */}
        <div
          onClick={() => setShowOverview(!showOverview)}
          style={{ justifyContent: 'center', cursor: 'pointer', fontWeight: 600 }}
        >
          <span>Financial Overview</span>
        </div>

        {/* Right: Expand/collapse chevron */}
        <div
          onClick={() => setShowOverview(!showOverview)}
          style={{ justifyContent: 'flex-end', cursor: 'pointer' }}
        >
          <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>{showOverview ? '▾' : '▸'}</span>
        </div>
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
                <div className="ovItemValue" style={{ color: '#4ade80bd' }}>{fmtTZS(totals.assets)}</div>
              </div>
              <div>
                <div className="ovItemLabel">Liabilities</div>
                <div className="ovItemValue" style={{ color: '#ff7f50bd' }}>{fmtTZS(totals.liabilities)}</div>
              </div>
            </div>
          </div>


          {/* Top Metrics Cards */}
        </>
      )}

      {/* Accounts View */}
      {viewMode === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {/* Wallets */}
          {renderMetaSection('WALLETS', 'wallet', totals.walletsBal, metaGroups.wallet)}

          {/* Obligations */}
          {renderMetaSection('OBLIGATIONS', 'obligations', totals.debtBal, metaGroups.obligations)}

          {/* Assets */}
          {renderMetaSection('ASSETS', 'asset', totals.assetsBal, metaGroups.asset)}

          {/* Savings */}
          {renderMetaSection('SAVINGS', 'savings', totals.savingsBal, metaGroups.savings)}
        </div>
      )}

      {viewMode === 'accounts' && (
        <>
          <button
            className="btn"
            type="button"
            style={{ width: '100%', marginTop: 12, marginBottom: 24, background: '#f5f5fa', border: '1px dashed #c5c5d3', color: '#6b7280', fontSize: 13 }}
            onClick={() => setShowAddGroupModal(true)}
          >
            + Add Group
          </button>

          {showAddGroupModal && (
            <div className="modalBackdrop" onClick={() => setShowAddGroupModal(false)}>
              <div className="modalCard" onClick={(e) => e.stopPropagation()}>
                <div className="modalTitle">Add Group</div>
                <div className="accQuickForm">
                  <div className="field">
                    <label>Group Name</label>
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. Loans"
                    />
                  </div>
                  <div className="field">
                    <label>Meta Category (Section)</label>
                    <select
                      value={newGroupMetaCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewGroupMetaCategory(val);
                        if (val === 'wallet') setNewGroupType('debit');
                        else if (val === 'asset') setNewGroupType('asset');
                        else if (val === 'debt') setNewGroupType('credit');
                        else if (val === 'savings') setNewGroupType('debit');
                      }}
                    >
                      <option value="wallet">WALLETS (Operational)</option>
                      <option value="obligations">OBLIGATIONS (Receivables & Payables)</option>
                      <option value="asset">ASSETS (Growth)</option>
                      <option value="savings">SAVINGS (Purpose)</option>
                    </select>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn" type="button" onClick={() => setShowAddGroupModal(false)}>Cancel</button>
                    <button className="btn primary" type="button" onClick={handleAddGroup}>Add</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  group,
  accountTxns,
  right,
  total,
  items,
  onDeleteAccount,
  onSelectAccount,
  onToggleCollapse,
  onEditGroup,
  onAddAccount,
  onMoveGroupUp,
  onMoveGroupDown,
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
  metaCategory,
  accounts,
}) {
  return (
    <div
      className={`sectionCard ${isDragging ? "dragging" : ""} ${dragOver ? "dragOver" : ""}`}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
        onAccountDropToGroup?.(group.id);
      }}
    >
      <div className="sectionHead">
        <div className="sectionTitle">
          <button className="sectionTitleBtn" type="button" onClick={onEditGroup} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 0 }}>

            {/* <div className={`stdIcon ${(group.type) === 'loan' && total > 0 ? 'loan' : ''}`}>
              {group.name.slice(0, 1).toUpperCase()}
            </div> */}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>{group.name}</span>
              </div>
              <span style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', lineHeight: 1 }}>
                {group.type}
              </span>
            </div>
          </button>
        </div>
        <div className="sectionRightWrap" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className={`sectionRight ${(group.type === "credit" || group.type === "loan") ? "owed" : ""} ${total < 0 ? "neg" : ""}`}>{right}</div>
          <button className="sectionAddBtn" type="button" onClick={onMoveGroupUp} style={{ fontSize: 13, background: 'none' }} title="Move group up">
            ↑
          </button>
          <button className="sectionAddBtn" type="button" onClick={onMoveGroupDown} style={{ fontSize: 13, background: 'none' }} title="Move group down">
            ↓
          </button>
          <button className="sectionAddBtn" type="button" onClick={onAddAccount} style={{ marginLeft: 4 }} title="Add Account">
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

              const metrics = (metaCategory === 'savings') ? calculateSavingsMetrics(a, accountTxns, accounts, bal) : null;

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
                    <div className={`stdRowCard ${(a.accountType || group.type) === 'loan' && bal > 0 ? 'loan' : ''}`}>
                      <div className="stdRowLeft" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`stdIcon ${(a.accountType || group.type) === 'loan' && bal > 0 ? 'loan' : ''}`}>
                          {a.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <div className={`stdName ${(a.accountType || group.type) === 'loan' && bal > 0 ? 'loan' : ''}`}>{a.name}</div>
                          {metaCategory === 'savings' && (
                            <div className="metricStack purple" style={{ alignItems: 'flex-start', marginTop: 2 }}>
                              <div className="metricLabel">PLANNED:</div>
                              <div className="metricValue">{fmtTZS(metrics.planned)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="stdRight">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div className={`stdBalPrefix ${bal < 0 ? "neg" : ""}`}>Bal.</div>
                            <div className={`stdBalLabel ${bal < 0 ? "neg" : ""}`}>
                              {fmtTZS(bal)}
                            </div>
                          </div>
                          {metaCategory === 'savings' && (
                            <div className="savingsMetrics">
                              <div className="metricStack green">
                                <div className="metricLabel">OWNED: {fmtTZS(metrics.total)}</div>
                              </div>
                              <div className="metricStack red">
                                <div className="metricLabel">LENT: {fmtTZS(metrics.lent)}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );


              const subs = Array.isArray(a.subAccounts) ? a.subAccounts : [];
              const isDebitAccount = (a.accountType || group.type) === 'debit';
              const visibleSubs = isDebitAccount
                ? subs.filter(s => Number(s.balance || 0) !== 0)
                : subs;

              if (visibleSubs.length && (expandedAccounts?.[a.id] || isDebitAccount)) {
                visibleSubs.forEach((s) => {
                  nodes.push(
                    <div className="rowItem subRow" key={`${a.id}-${s.id}`}>
                      <div className="rowLeft">
                        <div className="avatar subAvatar">
                          {(isDebitAccount && s.isUnallocated ? 'U' : s.name.slice(0, 1)).toUpperCase()}
                        </div>
                        <div>
                          <div className="rowName">{s.isUnallocated ? 'Unallocated' : s.name}</div>
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


function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
