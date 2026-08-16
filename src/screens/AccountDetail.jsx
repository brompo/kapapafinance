import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fmtTZS, fmtCompact, calculateAssetMetrics, calculateSavingsMetrics, calculateBucketSpentYTD, todayISO } from "../money.js";
import { accountHoldingResult } from "../utils/returns";

function formatDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function uid() {
  return Math.random().toString(36).substr(2, 9);
}

function fmtPct(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  const pct = rate * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function TrendsTab({ trends }) {
  if (!trends || trends.series.length === 0) {
    return <div className="emptyRow">No purchase, sale, or valuation history yet.</div>;
  }
  const { series, current, unrealizedGain, unrealizedPct, holding } = trends;
  const gainClass = unrealizedGain > 0 ? 'pos' : unrealizedGain < 0 ? 'neg' : '';
  return (
    <div>
      <div className="trendsStatsGrid">
        <div className="trendsStat">
          <div className="trendsStatLabel">Current value</div>
          <div className="trendsStatValue">{fmtTZS(current.marketValue)}</div>
        </div>
        <div className="trendsStat">
          <div className="trendsStatLabel">Total invested</div>
          <div className="trendsStatValue">{fmtTZS(current.costBasis)}</div>
        </div>
        <div className="trendsStat">
          <div className="trendsStatLabel">Unrealized gain</div>
          <div className={`trendsStatValue ${gainClass}`}>{fmtTZS(unrealizedGain)} ({fmtPct(unrealizedPct)})</div>
        </div>
        {current.realizedGain ? (
          <div className="trendsStat">
            <div className="trendsStatLabel">Realized gains</div>
            <div className={`trendsStatValue ${current.realizedGain > 0 ? 'pos' : 'neg'}`}>{fmtTZS(current.realizedGain)}</div>
          </div>
        ) : null}
        <div className="trendsStat">
          <div className="trendsStatLabel">Simple return</div>
          <div className="trendsStatValue">{fmtPct(holding.simpleRate)}</div>
        </div>
        <div className="trendsStat">
          <div className="trendsStatLabel">XIRR (annualized)</div>
          <div className="trendsStatValue">{fmtPct(holding.xirrRate)}</div>
        </div>
      </div>

      <div style={{ width: '100%', height: 240, marginTop: 16 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(d) => formatDay(d)}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v)} width={48} />
            <Tooltip
              labelFormatter={(d) => formatDay(d)}
              formatter={(value, name) => [fmtTZS(value), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="stepAfter" dataKey="invested" name="Invested" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="stepAfter" dataKey="marketValue" name="Market value" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}



export default function AccountDetail({
  account,
  accounts,
  allAccounts = [],
  groups,
  categories,
  accountTxns,
  focusAccountId,
  onFocusAccountUsed,
  onDetailOpen,
  onDetailClose,
  onToast,
  onClose,
  onAddAccountTxn,
  onIssueLoan,
  onTransferAccount,
  onPayCreditBack,
  onUpsertAccount,
  onDeleteAccount,
  onMergeAccounts,
  onUpdateAccountTxn,
  onUpdateAccountTxnMeta,
  onDeleteAccountTxn,
  onReallocateBuckets,
  onMarkDueFrom,
  onUnmarkDueFrom,
  onSettleDueFrom,
  getAccountBalance,
  clients,
  initialTab,
}) {
  const currentGroup = groups.find((g) => g.id === account.groupId);
  const metaCategory = currentGroup?.metaCategory || 'wallet';
  const effectiveType = account.accountType || currentGroup?.type || 'debit';

  const groupsById = useMemo(() => new Map((groups || []).map((g) => [g.id, g])), [groups]);

  // Trends tab: cost basis (invested) vs market value, sampled at each real
  // purchase/sale/valuation event date — no interpolation between events,
  // since there's no daily price feed for most assets.
  const trends = useMemo(() => {
    if (effectiveType !== 'asset') return null;
    const eventDates = [...new Set(
      accountTxns
        .filter((t) => t.accountId === account.id && ['purchase', 'sale', 'valuation'].includes(t.kind) && t.date)
        .map((t) => t.date)
    )].sort();
    const series = eventDates.map((date) => {
      const info = calculateAssetMetrics(account, accountTxns, effectiveType, date);
      return { date, invested: info.costBasis || 0, marketValue: info.marketValue || 0 };
    });
    const current = calculateAssetMetrics(account, accountTxns, effectiveType);
    const unrealizedGain = (current.marketValue || 0) - (current.costBasis || 0);
    const unrealizedPct = current.costBasis > 0 ? unrealizedGain / current.costBasis : null;
    const holding = accountHoldingResult(account, accountTxns, allAccounts?.length ? allAccounts : accounts, groupsById, todayISO(), 12);
    return { series, current, unrealizedGain, unrealizedPct, holding };
  }, [effectiveType, accountTxns, account.id, account, allAccounts, accounts, groupsById]);

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
  const [filterSubAccountId, setFilterSubAccountId] = useState(null);
  const [showPaybackModal, setShowPaybackModal] = useState(false);
  const [showPaybackPickerModal, setShowPaybackPickerModal] = useState(false);
  const [paybackTxn, setPaybackTxn] = useState(null);
  const [paybackAmount, setPaybackAmount] = useState('');
  const [paybackAccountId, setPaybackAccountId] = useState('');
  const [paybackSubAccountId, setPaybackSubAccountId] = useState('');
  const [paybackDate, setPaybackDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paybackError, setPaybackError] = useState(false);
  const [targetSubId, setTargetSubId] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adjustFromAccountId, setAdjustFromAccountId] = useState('');
  const [adjustFromSubAccountId, setAdjustFromSubAccountId] = useState('');
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
  const [purchaseFromAccountId, setPurchaseFromAccountId] = useState("");
  const [purchaseFromSubAccountId, setPurchaseFromSubAccountId] = useState("");
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
  const [creditNote, setCreditNote] = useState("");
  const [error, setError] = useState("");
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportInLabel, setExportInLabel] = useState(effectiveType === 'loan' ? 'Debit' : 'Credit');
  const [exportOutLabel, setExportOutLabel] = useState(effectiveType === 'loan' ? 'Credit' : 'Debit');
  const [editAccountType, setEditAccountType] = useState(account.accountType || '');
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [editTxnNote, setEditTxnNote] = useState("");
  const [editTxnDate, setEditTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editTxnAccountId, setEditTxnAccountId] = useState("");
  const [editTxnSubAccountId, setEditTxnSubAccountId] = useState(null);
  const [editCreditRate, setEditCreditRate] = useState("");
  const [editCreditType, setEditCreditType] = useState("simple");
  const [editReceiveDate, setEditReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editInterestStartDate, setEditInterestStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(account.name || "");
  const [editBalance, setEditBalance] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editError, setEditError] = useState("");
  const [editingSubAccountId, setEditingSubAccountId] = useState(null)
  const [subEditName, setSubEditName] = useState("")
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeFromId, setMergeFromId] = useState("")
  const [showAddBucketModal, setShowAddBucketModal] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [newBucketAmount, setNewBucketAmount] = useState('')
  const [showReallocateModal, setShowReallocateModal] = useState(false)
  const [reallocFromId, setReallocFromId] = useState('')
  const [reallocToId, setReallocToId] = useState('')
  const [reallocAmount, setReallocAmount] = useState('')
  const [activeTab, setActiveTab] = useState(initialTab || "activity") // activity | future | duefrom | valuations | trends | planner
  const [primaryTab, setPrimaryTab] = useState("activity") // activity | goals
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState([]);
  const [showMarkDueFromModal, setShowMarkDueFromModal] = useState(false);
  const [markDueFromAccountId, setMarkDueFromAccountId] = useState('');
  const [markDueFromDate, setMarkDueFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleGroup, setSettleGroup] = useState(null); // { accountId, entryIds, total }
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const isAnyModalOpen = !!(
    mode ||
    showAddPlanModal ||
    showCreditModal ||
    showPurchaseModal ||
    showSaleModal ||
    showValuationModal ||
    showEditModal ||
    showExportModal ||
    showPaybackModal ||
    showPaybackPickerModal ||
    selectedTxn ||
    editingSubAccountId ||
    showAddBucketModal ||
    showReallocateModal ||
    showMergeModal ||
    showMarkDueFromModal ||
    settleGroup
  );
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanAmount, setNewPlanAmount] = useState("");
  const [newPlanType, setNewPlanType] = useState("expense"); // expense | budget

  // "Due From" tracking is debit-account-to-debit-account only — see AppContext's
  // markDueFrom/settleDueFrom for the mutators these use.
  const isDueFromEligible = (t) => t.direction === 'out' && t.kind === 'txn' && !t.dueFrom;

  const dueFromSourceAccounts = useMemo(() => (
    accounts.filter(a => {
      if (a.id === account.id || a.archived) return false
      const type = a.accountType || groups.find(g => g.id === a.groupId)?.type
      return type === 'debit'
    })
  ), [accounts, groups, account.id]);

  const selectedTotal = useMemo(() => {
    if (!selectedEntryIds.length) return 0;
    const idSet = new Set(selectedEntryIds);
    return accountTxns.reduce((s, t) => (idSet.has(t.id) ? s + Number(t.amount || 0) : s), 0);
  }, [accountTxns, selectedEntryIds]);

  const dueFromGroups = useMemo(() => {
    const pending = accountTxns.filter(t => t.accountId === account.id && t.dueFrom?.status === 'pending');
    const map = new Map();
    for (const t of pending) {
      const key = t.dueFrom.accountId;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return Array.from(map.entries()).map(([accountId, items]) => ({
      accountId,
      items,
      total: items.reduce((s, t) => s + Number(t.amount || 0), 0)
    }));
  }, [accountTxns, account.id]);

  function handleOpenTxnEdit(t) {
    setSelectedTxn(t);
    setEditTxnAmount(t.amount || "");
    setEditTxnNote(t.note || "");
    setEditTxnDate(t.date || new Date().toISOString().slice(0, 10));
    setEditTxnAccountId(t.accountId || "");
    setEditTxnSubAccountId(t.subAccountId || null);
    if (t.kind === "credit") {
      setEditCreditRate(t.creditRate || "");
      setEditCreditType(t.creditType || "simple");
      setEditReceiveDate(t.receiveDate || t.date || new Date().toISOString().slice(0, 10));
      setEditInterestStartDate(t.interestStartDate || t.date || new Date().toISOString().slice(0, 10));
    }
  }

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
  }, [account.id, account.name]);

  useEffect(() => {
    if (!showMarkDueFromModal) return;
    if (!markDueFromAccountId && dueFromSourceAccounts.length) {
      setMarkDueFromAccountId(dueFromSourceAccounts[0].id);
    }
  }, [showMarkDueFromModal, markDueFromAccountId, dueFromSourceAccounts]);

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

  // Calculations for Hero Header
  const plans = Array.isArray(account.plans) ? account.plans : [];
  const totalPlanned = plans.reduce((s, p) => s + Number(p.amount || 0), 0);
  const currentBalance = getAccountBalance(account, 'current', true);
  const progressPercent = totalPlanned > 0 ? Math.min(100, Math.floor((currentBalance / totalPlanned) * 100)) : 0;

  const entries = useMemo(() => {
    let filtered = accountTxns.filter((t) => t.accountId === account.id);
    if (filterSubAccountId) {
      filtered = filtered.filter((t) => t.subAccountId === filterSubAccountId);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (activeTab === "future") {
      filtered = filtered.filter((t) => t.date > today);
    } else if (activeTab === "valuations") {
      filtered = filtered.filter((t) => t.date <= today && t.kind === 'valuation');
    } else {
      filtered = filtered.filter((t) => t.date <= today && t.kind !== 'valuation');
    }

    return filtered.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  }, [accountTxns, account.id, filterSubAccountId, activeTab]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of entries) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    return Array.from(map.entries());
  }, [entries]);

  function exportToCSV() {
    const rows = [['Date', 'Description', 'Source', exportInLabel, exportOutLabel, 'Cumulative Total']]
    // Process oldest-first for running total
    const sorted = [...entries].reverse()
    let runningTotal = 0
    for (const t of sorted) {
      const date = t.date || ''
      const desc = (t.note || t.kind || 'Transaction').replace(/"/g, '""')
      const relatedAcct = t.relatedAccountId ? accounts.find(a => a.id === t.relatedAccountId) : null
      const subName = account.subAccounts?.find(s => s.id === t.subAccountId)?.name || ''
      let source = ''
      if (t.direction === 'in' && relatedAcct) {
        source = relatedAcct.name
      } else if (t.direction === 'out') {
        source = subName || account.name
      } else {
        source = subName || account.name
      }
      const col4 = t.direction === 'in' ? Number(t.amount || 0) : ''
      const col5 = t.direction === 'out' ? Number(t.amount || 0) : ''
      // Credit increases total, Debit decreases total
      const amt = Number(t.amount || 0)
      if (t.direction === 'in') {
        runningTotal += exportInLabel === 'Credit' ? amt : -amt
      } else {
        runningTotal += exportOutLabel === 'Credit' ? amt : -amt
      }
      rows.push([date, `"${desc}"`, `"${source.replace(/"/g, '""')}"`, col4, col5, runningTotal])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const subName = filterSubAccountId
      ? account.subAccounts?.find(s => s.id === filterSubAccountId)?.name || 'sub'
      : ''
    a.href = url
    a.download = `${account.name}${subName ? ' - ' + subName : ''} Transactions.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

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
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : []
    const isDebit = effectiveType === 'debit'
    if (subs.length && !subAccountId && !isDebit) {
      setError("Select a sub-account.");
      return;
    }
    const resolvedSubId = subs.length
      ? (subAccountId || (isDebit ? subs.find(s => s.isUnallocated)?.id || subs[0]?.id : null))
      : null
    setError("");

    // If a From Account is specified, treat as a transfer
    if (adjustFromAccountId) {
      const fromAcct = accounts.find(a => a.id === adjustFromAccountId)
      const fromSubs = Array.isArray(fromAcct?.subAccounts) ? fromAcct.subAccounts : []
      const resolvedFromSubId = adjustFromSubAccountId || (fromSubs.find(s => s.isUnallocated)?.id || null)
      await onTransferAccount({
        fromId: adjustFromAccountId,
        toId: account.id,
        amount: amt,
        note: note || '',
        fromSubAccountId: resolvedFromSubId,
        toSubAccountId: resolvedSubId,
        date: adjustDate
      })
    } else {
      await onAddAccountTxn({
        accountId: account.id,
        subAccountId: resolvedSubId,
        amount: amt,
        direction,
        note,
        receiveDate: adjustDate,
      });
    }
    setAmount("");
    setNote("");
    setAdjustDate(new Date().toISOString().slice(0, 10));
    setAdjustFromAccountId('');
    setAdjustFromSubAccountId('');
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
    if (!purchaseFromAccountId) {
      setError("Select the account to pay from.");
      return;
    }
    const fromAcct = accounts.find(a => a.id === purchaseFromAccountId);
    const fromSubs = Array.isArray(fromAcct?.subAccounts) ? fromAcct.subAccounts : [];
    if (fromSubs.length && !purchaseFromSubAccountId) {
      setError("Select the sub-account to pay from.");
      return;
    }
    const unitPrice = total / qty;
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
      fee,
      fromId: purchaseFromAccountId,
      fromSubAccountId: purchaseFromSubAccountId || null,
    });
    setPurchaseUnit("");
    setPurchaseQty("");
    setPurchaseTotal("");
    setPurchaseFee("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseFromAccountId("");
    setPurchaseFromSubAccountId("");
    setShowPurchaseModal(false);
  }

  async function handleValuation() {
    const price = Number(valuationPrice || 0);
    if (!price || price <= 0) return onToast("Enter a valid price.");

    await onAddAccountTxn({
      accountId: account.id,
      amount: 0,
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
        amount: 0,
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
    const fromAcct = accounts.find(a => a.id === fromAccountId)
    const fromSubs = Array.isArray(fromAcct?.subAccounts) ? fromAcct.subAccounts : []
    const fromIsDebit = (fromAcct?.accountType || groups.find(g => g.id === fromAcct?.groupId)?.type) === 'debit'
    if (fromSubs.length && !subAccountId && !fromIsDebit) {
      setError("Select a sub-account.");
      return;
    }
    const target = accounts.find((a) => a.id === targetId);
    const targetSubs = Array.isArray(target?.subAccounts) ? target.subAccounts : []
    const targetIsDebit = (target?.accountType || groups.find(g => g.id === target?.groupId)?.type) === 'debit'
    if (targetSubs.length && !targetSubId && !targetIsDebit) {
      setError("Select a target sub-account.");
      return;
    }
    const resolvedFromSubId = fromSubs.length
      ? (subAccountId || (fromIsDebit ? fromSubs.find(s => s.isUnallocated)?.id || null : null))
      : null
    const resolvedTargetSubId = targetSubs.length
      ? (targetSubId || (targetIsDebit ? targetSubs.find(s => s.isUnallocated)?.id || null : null))
      : null
    if (targetId === fromAccountId && resolvedFromSubId === resolvedTargetSubId) {
      setError("Select a different sub-account.");
      return;
    }
    setError("");
    await onTransferAccount({
      fromId: fromAccountId,
      toId: targetId,
      amount: amt,
      note,
      fromSubAccountId: resolvedFromSubId,
      toSubAccountId: resolvedTargetSubId,
      date: transferDate,
    });
    setAmount("");
    setNote("");
    setMode(null);
  }

  async function handleAddPlan() {
    const amt = Number(newPlanAmount || 0);
    const name = newPlanName.trim();
    if (!name || amt <= 0) {
      onToast("Enter valid name and amount.");
      return;
    }

    const newPlan = { id: uid(), name, amount: amt, type: newPlanType };
    const nextPlans = [...(Array.isArray(account.plans) ? account.plans : []), newPlan];

    await onUpsertAccount({ ...account, plans: nextPlans });
    setNewPlanName("");
    setNewPlanAmount("");
    setShowAddPlanModal(false);
    onToast("Plan added.");
  }

  async function handleDeletePlan(planId) {
    const nextPlans = (account.plans || []).filter(p => p.id !== planId);
    await onUpsertAccount({ ...account, plans: nextPlans });
    onToast("Plan removed.");
  }

  function renderPlannerTab() {
    const plans = Array.isArray(account.plans) ? account.plans : [];
    const totalPlanned = plans.reduce((s, p) => s + Number(p.amount || 0), 0);

    return (
      <div className="plannerContent">
        <div className="plannerSummaryCard compact">
          <div className="plannerSummaryMain">
            <div className="plannerSummaryLabel">TOTAL PLANNED</div>
            <div className="plannerSummaryValue">{fmtTZS(totalPlanned)}</div>
          </div>
          <button
            className="plannerAddBtn"
            onClick={() => setShowAddPlanModal(true)}
          >
            + Add Goal
          </button>
        </div>

        <div className="accHistoryCard">
          <div className="accHistoryHead" style={{ padding: '8px 12px' }}>
            <div className="accHistoryTitle" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>GOALS & TARGETS</div>
          </div>
          <div className="accHistoryBody">
            {plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🎯</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#64748b' }}>Design your Roadmap</div>
              </div>
            ) : (
              plans.map(p => (
                <div key={p.id} className="accHistoryRow">
                  <div className="accHistoryIcon">🎯</div>
                  <div className="accHistoryInfo">
                    <div className="accHistoryTitleRow">{p.name}</div>
                    <div className="accHistoryMeta" style={{ textTransform: 'uppercase' }}>{p.type}</div>
                  </div>
                  <div className="accHistoryAmount" style={{ color: '#1e293b' }}>
                    {fmtTZS(p.amount)}
                  </div>
                  <button
                    className="plannerGoalDelete"
                    onClick={() => handleDeletePlan(p.id)}
                    style={{ marginLeft: 8, opacity: 0.4 }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const mergeCandidates = allAccounts.filter(a => a.id !== account.id && !a.archived);

  function handleOpenMerge() {
    setMergeFromId(mergeCandidates[0]?.id || "");
    setShowMergeModal(true);
  }

  function handleConfirmMerge() {
    const fromAcc = mergeCandidates.find(a => a.id === mergeFromId);
    if (!fromAcc) return;
    if (!window.confirm(`Merge "${fromAcc.name}" into "${account.name}"? Their balances will combine, and "${fromAcc.name}" will be archived.`)) return;
    onMergeAccounts?.(account.id, fromAcc.id);
    setShowMergeModal(false);
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
    setEditBalance(account.balance || 0);
    setEditGroupId(account.groupId);
    setEditAccountType(account.accountType || '');
    setEditError("");
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    const name = (editName || "").trim();
    if (!name) {
      setEditError("Enter a name.");
      return;
    }
    const newGroup = editGroupId ? groups.find(g => g.id === editGroupId) : null;
    const type = editAccountType || newGroup?.type || currentGroup?.type || account.groupType || "debit";

    await onUpsertAccount?.({
      ...account,
      name,
      groupId: editGroupId || account.groupId,
      groupType: type,
      accountType: editAccountType || undefined,
    });

    // Balance update logic for Debit and Loan accounts
    if (type === 'debit' || type === 'loan') {
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
    onToast?.("Account updated.");
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
      if (!rate || !t.interestStartDate || t.creditType === "none") return;
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
    const info = calculateAssetMetrics(account, accountTxns, effectiveType);
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
      setError(effectiveType === 'loan' ? "Select the account to fund the loan from." : "Select the account to receive the money.");
      return;
    }
    const target = accounts.find((a) => a.id === creditToAccountId);
    const subs = Array.isArray(target?.subAccounts) ? target.subAccounts : [];
    if (subs.length && !creditToSubId) {
      setError(effectiveType === 'loan' ? "Select a sub-account for the funding account." : "Select a sub-account for the receiving account.");
      return;
    }
    setError("");
    if (effectiveType === 'loan') {
      await onIssueLoan({
        loanAccountId: account.id,
        fromAccountId: creditToAccountId,
        fromSubAccountId: creditToSubId || null,
        amount: amt,
        note: creditNote,
        receiveDate,
        creditRate: rate,
        creditType,
        interestStartDate: creditType !== 'none' ? interestStartDate : null,
      });
    } else {
      await onAddAccountTxn({
        accountId: account.id,
        amount: amt,
        direction: "in",
        note: creditNote,
        kind: "credit",
        creditRate: rate,
        creditType,
        receiveDate,
        interestStartDate: creditType !== 'none' ? interestStartDate : null,
        creditToAccountId,
        creditToSubAccountId: creditToSubId || null,
      });
    }
    setCreditAmount("");
    setCreditRate("");
    setCreditToAccountId("");
    setCreditToSubId("");
    setCreditNote("");
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
      const txnDate = editReceiveDate || selectedTxn.date;
      onUpdateAccountTxn?.(selectedTxn.id, {
        amount: amt,
        note: editTxnNote || "",
        date: txnDate,
        accountId: editTxnAccountId,
        subAccountId: editTxnSubAccountId,
        creditRate: Number(editCreditRate || 0),
        creditType: editCreditType,
        receiveDate: txnDate,
        interestStartDate: editCreditType !== 'none' ? (editInterestStartDate || txnDate) : null,
      });
    } else {
      onUpdateAccountTxn?.(selectedTxn.id, {
        amount: amt,
        note: editTxnNote || "",
        date: editTxnDate || selectedTxn.date,
        accountId: editTxnAccountId,
        subAccountId: editTxnSubAccountId
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
    const nextSubs = [
      ...subs,
      { id: crypto.randomUUID(), name: trimmed, balance: 0 },
    ];
    onUpsertAccount({ ...account, subAccounts: nextSubs });
    if (!subAccountId) setSubAccountId(nextSubs[0].id);
  }

  function handleAddBucket() {
    const name = newBucketName.trim()
    if (!name) return
    const amt = Number(newBucketAmount || 0)
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : []
    const currentBalance = getAccountBalance(account, 'current', true)

    if (subs.length === 0) {
      const unallocId = crypto.randomUUID()
      const newBucketId = crypto.randomUUID()
      const nextSubs = [
        { id: unallocId, name: 'Unallocated', balance: currentBalance - amt, isUnallocated: true },
        { id: newBucketId, name, balance: amt },
      ]
      onUpsertAccount({ ...account, balance: 0, subAccounts: nextSubs })
    } else {
      const newBucketId = crypto.randomUUID()
      const nextSubs = subs.map(s =>
        s.isUnallocated ? { ...s, balance: Number(s.balance || 0) - amt } : s
      )
      nextSubs.push({ id: newBucketId, name, balance: amt })
      onUpsertAccount({ ...account, subAccounts: nextSubs })
    }

    setShowAddBucketModal(false)
    setNewBucketName('')
    setNewBucketAmount('')
  }

  function handleSaveSubEdit() {
    if (!subEditName.trim()) return
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : []
    const nextSubs = subs.map(s => {
      if (s.id !== editingSubAccountId) return s
      return { ...s, name: subEditName.trim() }
    })
    onUpsertAccount({ ...account, subAccounts: nextSubs })
    setEditingSubAccountId(null)
  }
  function handleDeleteSubAccount(subId) {
    const sub = (account.subAccounts || []).find(s => s.id === subId)
    if (!sub) return
    const bal = Number(sub.balance || 0)

    if (effectiveType === 'debit' && !sub.isUnallocated) {
      const msg = bal !== 0
        ? `Delete "${sub.name}"? Its balance of ${fmtTZS(bal)} will move to Unallocated.`
        : `Delete bucket "${sub.name}"?`
      if (!window.confirm(msg)) return
      const nextSubs = (account.subAccounts || [])
        .filter(s => s.id !== subId)
        .map(s => s.isUnallocated ? { ...s, balance: Number(s.balance || 0) + bal } : s)
      onUpsertAccount({ ...account, subAccounts: nextSubs })
    } else {
      const msg = bal !== 0
        ? `This sub-account has a balance of ${fmtTZS(bal)}. Deleting it will discard this balance. Continue?`
        : "Delete this sub-account?"
      if (!window.confirm(msg)) return
      const nextSubs = (account.subAccounts || []).filter(s => s.id !== subId)
      onUpsertAccount({ ...account, subAccounts: nextSubs })
    }
  }

  return (
    <div className="accountsScreen accountDetail">
      <div className="accDetailCard">

        <div className="accDetailActionsTop">
          <button className="miniActionBtn" onClick={onClose}>✕</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="miniActionBtn" onClick={handleEdit}>Edit</button>
            {mergeCandidates.length > 0 && onMergeAccounts && (
              <button className="miniActionBtn" onClick={handleOpenMerge}>Merge</button>
            )}
            <button className="miniActionBtn" onClick={handleDelete} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5' }}>Delete</button>
          </div>
        </div>
        <div className="accDetailTitleRow">
          <div className="accDetailIcon">
            {account.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="accDetailTitle">
            <h2>{account.name}</h2>
            <span>
              {calculateAssetMetrics(account, accountTxns, effectiveType).hasData
                ? `${calculateAssetMetrics(account, accountTxns, effectiveType).qty} ${calculateAssetMetrics(account, accountTxns, effectiveType).unit || currentGroup?.name}`
                : currentGroup?.name}
            </span>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "700" }}>
              {fmtTZS(getAccountBalance(account, 'current', true))}
            </div>
            {getAccountBalance(account, 'current', true) !== getAccountBalance(account, 'projected', true) ? (
              <div style={{ fontSize: "0.85rem", opacity: 0.6 }}>
                Prj. {fmtTZS(getAccountBalance(account, 'projected', true))}
              </div>
            ) : null}
          </div>
        </div>

        {metaCategory === 'savings' && totalPlanned > 0 && (
          <div className="headerGoalProgress ultra-compact">
            <div className="goalProgressHeader">
              <div className="goalLabelGroup">
                <span className="goalLabel">GOALS FUNDED</span>
                <span className="goalPercent">{progressPercent}%</span>
              </div>
              <div className="goalProgressFooter headerMode">
                {fmtTZS(currentBalance)} / {fmtTZS(totalPlanned)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Tab Navigation - Only shown for Savings Accounts */}
      {metaCategory === 'savings' && (
        <div className="primaryTabs">
          <div
            className={`primaryTab ${primaryTab === 'activity' ? 'active' : ''}`}
            onClick={() => setPrimaryTab('activity')}
          >
            Activities
          </div>
          <div
            className={`primaryTab ${primaryTab === 'goals' ? 'active' : ''}`}
            onClick={() => setPrimaryTab('goals')}
          >
            Goals & Plans
          </div>
        </div>
      )}

      <div className="accDetailInnerCard" style={{ marginTop: 0 }}>

        {primaryTab === 'activity' && (
          <>
            {/* Metrics Grid */}
            {effectiveType === 'asset' && (() => {
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

            {effectiveType === 'credit' && (() => {
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

            {(effectiveType === 'debit' || (Array.isArray(account.subAccounts) && account.subAccounts.length > 0)) && (
              <div className="accHistory" style={{ marginBottom: 20 }}>
                <div className="accHistoryTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{effectiveType === 'debit' ? 'Buckets' : 'Sub-accounts'}</span>
                  {effectiveType === 'debit' && Array.isArray(account.subAccounts) && account.subAccounts.length > 1 && (
                    <button className="miniBtn" type="button" onClick={() => {
                      const namedSubs = (account.subAccounts || []).filter(s => !s.isUnallocated)
                      setReallocFromId(namedSubs[0]?.id || '')
                      setReallocToId(namedSubs[1]?.id || (account.subAccounts.find(s => s.isUnallocated)?.id || ''))
                      setReallocAmount('')
                      setShowReallocateModal(true)
                    }}>Reallocate</button>
                  )}
                </div>
                {Array.isArray(account.subAccounts) && account.subAccounts.length > 0 ? (
                  <div className="list">
                    {account.subAccounts
                      .map((s) => {
                        const spentYTD = effectiveType === 'debit' ? calculateBucketSpentYTD(s.id, accountTxns) : 0
                        return (
                          <div
                            className={`rowItem subRow ${filterSubAccountId === s.id ? 'active' : ''}`}
                            key={s.id}
                            onClick={() => setFilterSubAccountId(filterSubAccountId === s.id ? null : s.id)}
                            role="button"
                            tabIndex={0}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="rowLeft">
                              <div className="avatar subAvatar">{(s.isUnallocated ? 'U' : s.name.slice(0, 1)).toUpperCase()}</div>
                              <div>
                                <div className="rowName">{s.isUnallocated ? 'Unallocated' : s.name}</div>
                              </div>
                            </div>
                            <div className="rowRight" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <div className={`rowAmount ${Number(s.balance || 0) < 0 ? "neg" : ""}`}>{fmtTZS(s.balance)}</div>
                                {effectiveType === 'debit' && spentYTD > 0 && (
                                  <div style={{ fontSize: '0.7rem', color: '#EF4444' }}>Spent YTD: {fmtTZS(spentYTD)}</div>
                                )}
                              </div>
                              {!s.isUnallocated && (
                                <button className="miniBtn" type="button" onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingSubAccountId(s.id)
                                  setSubEditName(s.name)
                                }}>Edit</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div className="emptyRow">{effectiveType === 'debit' ? 'No buckets yet.' : 'No sub-accounts yet.'}</div>
                )}
                {effectiveType === 'debit' && (
                  <button className="btn" type="button" onClick={() => { setNewBucketName(''); setNewBucketAmount(''); setShowAddBucketModal(true) }}>
                    Add Bucket
                  </button>
                )}
                {effectiveType !== 'debit' && (
                  <button className="btn" type="button" onClick={handleAddSubAccount}>
                    Add Sub-account
                  </button>
                )}
              </div>
            )}
          </>
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
                        const fromIsDebit = (fromAcct?.accountType || groups.find(g => g.id === fromAcct?.groupId)?.type) === 'debit'
                        if (!fromSubs.length) return null
                        return (
                          <div className="field">
                            <label>{fromIsDebit ? 'From Bucket (optional)' : 'From sub-account'}</label>
                            <select value={subAccountId} onChange={(e) => setSubAccountId(e.target.value)}>
                              <option value="">{fromIsDebit ? '— Unallocated' : 'Select'}</option>
                              {fromSubs.filter(s => !s.isUnallocated).map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
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
                        const targetIsDebit = (target?.accountType || groups.find(g => g.id === target?.groupId)?.type) === 'debit'
                        return (
                          <div className="field">
                            <label>{targetIsDebit ? 'To Bucket (optional)' : 'To sub-account'}</label>
                            <select value={targetSubId} onChange={(e) => setTargetSubId(e.target.value)}>
                              <option value="">{targetIsDebit ? '— Unallocated' : 'Select'}</option>
                              {target.subAccounts
                                .filter(s => !s.isUnallocated)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
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
                          <label>{effectiveType === 'debit' ? 'Bucket (optional)' : 'Sub-account'}</label>
                          <select value={subAccountId} onChange={(e) => setSubAccountId(e.target.value)}>
                            <option value="">{effectiveType === 'debit' ? '— Unallocated' : 'Select'}</option>
                            {account.subAccounts
                              .filter(s => !s.isUnallocated)
                              .map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                          </select>
                        </div>
                      )}

                      <div className="field">
                        <label>From Account (optional)</label>
                        <select
                          value={adjustFromAccountId}
                          onChange={(e) => {
                            setAdjustFromAccountId(e.target.value)
                            setAdjustFromSubAccountId('')
                          }}
                        >
                          <option value="">None — direct add</option>
                          {accounts.filter(a => a.id !== account.id).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      {(() => {
                        const fromAcct = accounts.find(a => a.id === adjustFromAccountId)
                        const fromSubs = fromAcct && Array.isArray(fromAcct.subAccounts) ? fromAcct.subAccounts : []
                        const fromIsDebit = (fromAcct?.accountType || groups.find(g => g.id === fromAcct?.groupId)?.type) === 'debit'
                        if (!fromSubs.length) return null
                        return (
                          <div className="field">
                            <label>{fromIsDebit ? 'From Bucket (optional)' : 'From sub-account'}</label>
                            <select value={adjustFromSubAccountId} onChange={e => setAdjustFromSubAccountId(e.target.value)}>
                              <option value="">{fromIsDebit ? '— Unallocated' : 'Select'}</option>
                              {fromSubs.filter(s => !s.isUnallocated).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })()}
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
                <div className="modalTitle">{effectiveType === 'loan' ? 'Issue Loan' : 'Add Credit'}</div>
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
                    <label>Interest Type</label>
                    <select value={creditType} onChange={(e) => setCreditType(e.target.value)}>
                      <option value="simple">Simple</option>
                      <option value="compound">Compound</option>
                      <option value="none">No Interest</option>
                    </select>
                  </div>
                  <div className="field" style={creditType === 'none' ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
                    <label>Annual Interest Rate (% p.a.)</label>
                    <input
                      inputMode="decimal"
                      value={creditRate}
                      onChange={(e) => setCreditRate(e.target.value)}
                      placeholder="e.g. 2"
                      disabled={creditType === 'none'}
                    />
                  </div>
                  <div className="field">
                    <label>{effectiveType === 'loan' ? 'Loan Date' : 'Receiving Date'}</label>
                    <input
                      type="date"
                      value={receiveDate}
                      onChange={(e) => setReceiveDate(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>{effectiveType === 'loan' ? 'From account' : 'To account'}</label>
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
                        <label>{effectiveType === 'loan' ? 'From sub-account' : 'To sub-account'}</label>
                        <select value={creditToSubId} onChange={(e) => setCreditToSubId(e.target.value)}>
                          <option value="">Select sub-account</option>
                          {target.subAccounts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  {creditType !== 'none' && (
                    <div className="field">
                      <label>Interest Start Date</label>
                      <input
                        type="date"
                        value={interestStartDate}
                        onChange={(e) => setInterestStartDate(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="field">
                    <label>Notes</label>
                    <input
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      placeholder={effectiveType === 'loan' ? 'e.g. Business loan to John' : 'e.g. Credit from CRDB Bank'}
                    />
                  </div>
                  {error && <div className="formError">{error}</div>}
                  <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                    <button className="btn" type="button" onClick={() => setShowCreditModal(false)}>
                      Cancel
                    </button>
                    <button className="btn primary" type="button" onClick={handleAddCredit}>
                      {effectiveType === 'loan' ? 'Issue Loan' : 'Save Credit'}
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
                    <label>Pay From</label>
                    <select
                      value={purchaseFromAccountId}
                      onChange={(e) => { setPurchaseFromAccountId(e.target.value); setPurchaseFromSubAccountId(""); }}
                    >
                      <option value="">— Select account —</option>
                      {accounts
                        .filter((a) => {
                          const g = groups.find((g) => g.id === a.groupId);
                          return g && g.metaCategory !== 'asset';
                        })
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                  </div>
                  {(() => {
                    const fromAcct = accounts.find(a => a.id === purchaseFromAccountId);
                    const fromSubs = Array.isArray(fromAcct?.subAccounts) ? fromAcct.subAccounts : [];
                    if (!fromSubs.length) return null;
                    return (
                      <div className="field">
                        <label>Sub-account</label>
                        <select
                          value={purchaseFromSubAccountId}
                          onChange={(e) => setPurchaseFromSubAccountId(e.target.value)}
                        >
                          <option value="">— Select sub-account —</option>
                          {fromSubs.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
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
                        purchaseQty && purchaseTotal
                          ? (Number(purchaseTotal) / Number(purchaseQty)).toFixed(2)
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
                <div className="modalTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{selectedTxn.kind === "credit" ? (effectiveType === 'loan' ? "Edit Loan" : "Edit Credit") : "Transaction"}</span>
                  <button className="iconBtn" type="button" onClick={() => setSelectedTxn(null)} style={{ fontSize: 18 }}>✕</button>
                </div>

                <div className="accQuickForm">
                  <div className="field">
                    <label>Account</label>
                    <select value={editTxnAccountId} onChange={(e) => {
                      setEditTxnAccountId(e.target.value);
                      const acct = accounts.find(a => a.id === e.target.value);
                      const subs = Array.isArray(acct?.subAccounts) ? acct.subAccounts : [];
                      setEditTxnSubAccountId(subs.length > 0 ? subs[0].id : null);
                    }}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  {(() => {
                    const acct = accounts.find(a => a.id === editTxnAccountId);
                    const subs = Array.isArray(acct?.subAccounts) ? acct.subAccounts : [];
                    if (subs.length === 0) return null;
                    return (
                      <div className="field">
                        <label>Sub-account</label>
                        <select value={editTxnSubAccountId || ""} onChange={(e) => setEditTxnSubAccountId(e.target.value)}>
                          {subs.map(s => <option key={s.id} value={s.id}>{s.name || 'Sub-account'}</option>)}
                        </select>
                      </div>
                    );
                  })()}
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
                      <label>Interest Type</label>
                      <select value={editCreditType} onChange={(e) => setEditCreditType(e.target.value)}>
                        <option value="simple">Simple</option>
                        <option value="compound">Compound</option>
                        <option value="none">No Interest</option>
                      </select>
                    </div>
                  )}
                  {selectedTxn.kind === "credit" && (
                    <div className="field" style={editCreditType === 'none' ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
                      <label>Annual Interest Rate (% p.a.)</label>
                      <input
                        inputMode="decimal"
                        value={editCreditRate}
                        onChange={(e) => setEditCreditRate(e.target.value)}
                        disabled={editCreditType === 'none'}
                      />
                    </div>
                  )}
                  {selectedTxn.kind === "credit" && (
                    <div className="field">
                      <label>{effectiveType === 'loan' ? 'Loan Date' : 'Receiving Date'}</label>
                      <input
                        type="date"
                        value={editReceiveDate}
                        onChange={(e) => setEditReceiveDate(e.target.value)}
                      />
                    </div>
                  )}
                  {selectedTxn.kind === "credit" && editCreditType !== 'none' && (
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
                  {selectedTxn.kind !== "credit" && (
                    <div className="field">
                      <label>Date</label>
                      <input
                        type="date"
                        value={editTxnDate}
                        onChange={(e) => setEditTxnDate(e.target.value)}
                      />
                    </div>
                  )}
                  {error && <div className="formError">{error}</div>}
                  {selectedTxn.direction === 'in' && selectedTxn.paidBack && selectedTxn.paidBack.length > 0 && (
                    <div className="reimbursedBadge" style={{ marginBottom: 4, fontSize: 13, padding: '6px 12px' }}>
                      ✓ Paid back {fmtTZS(selectedTxn.paidBack.reduce((s, r) => s + Number(r.amount || 0), 0))}
                    </div>
                  )}
                  {selectedTxn.dueFrom && (
                    <div className={`dueFromBadge ${selectedTxn.dueFrom.status}`} style={{ marginBottom: 4 }}>
                      {selectedTxn.dueFrom.status === 'pending' ? 'Due from ' : '✓ Received from '}
                      {accounts.find(a => a.id === selectedTxn.dueFrom.accountId)?.name || 'account'}
                    </div>
                  )}
                  <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                    {selectedTxn.dueFrom?.status === 'pending' && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          onUnmarkDueFrom?.(selectedTxn.id);
                          setSelectedTxn(null);
                        }}
                      >
                        Unmark Due From
                      </button>
                    )}
                    {selectedTxn.direction === 'in' && (
                      <button
                        className="btn"
                        type="button"
                        style={{ borderColor: '#1a9a50', background: '#1a9a50', color: '#fff' }}
                        onClick={() => {
                          const t = selectedTxn
                          setPaybackTxn(t)
                          const alreadyPaid = (t.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                          setPaybackAmount(String(Number(t.amount || 0) - alreadyPaid))
                          setPaybackAccountId('')
                          setPaybackSubAccountId('')
                          setPaybackDate(new Date().toISOString().slice(0, 10))
                          setPaybackError(false)
                          setSelectedTxn(null)
                          setShowPaybackModal(true)
                        }}
                      >
                        Receive Money
                      </button>
                    )}
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

        {showPaybackPickerModal && (() => {
          const creditTxns = accountTxns.filter(t => t.accountId === account.id && t.kind === 'credit');
          const outstanding = creditTxns.filter(t => {
            const alreadyPaid = (t.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0);
            return Number(t.amount || 0) - alreadyPaid > 0;
          });
          const subAccountsWithBalance = (Array.isArray(account.subAccounts) ? account.subAccounts : [])
            .map(s => ({ ...s, balance: getAccountBalance({ ...account, subAccounts: [], id: s.id, balance: s.balance }) }))
            .filter(s => Number(s.balance || 0) > 0);
          const hasAnything = outstanding.length > 0 || subAccountsWithBalance.length > 0;
          const openPayback = (txn) => {
            setPaybackTxn(txn);
            setPaybackAmount(String(txn.amount));
            setPaybackAccountId('');
            setPaybackSubAccountId('');
            setPaybackDate(new Date().toISOString().slice(0, 10));
            setPaybackError(false);
            setShowPaybackPickerModal(false);
            setShowPaybackModal(true);
          };
          return (
            <div className="modalBackdrop" onClick={() => setShowPaybackPickerModal(false)}>
              <div className="modalCard" onClick={e => e.stopPropagation()}>
                <div className="modalTitle">{effectiveType === 'loan' ? 'Select Loan to Receive Payback' : 'Select Credit to Pay Back'}</div>
                <div className="accQuickForm">
                  {!hasAnything && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#888' }}>No outstanding {effectiveType === 'loan' ? 'loans' : 'credits'} to pay back.</div>
                  )}
                  {outstanding.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Individual Loans</div>
                      {outstanding.map(t => {
                        const alreadyPaid = (t.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0);
                        const remaining = Number(t.amount || 0) - alreadyPaid;
                        return (
                          <div
                            key={t.id}
                            className="accHistoryRow"
                            style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 12px', marginBottom: 6, background: '#f5f5f5' }}
                            onClick={() => openPayback({ ...t, amount: remaining })}
                          >
                            <div className="accHistoryInfo">
                              <div className="accHistoryTitleRow"><span>{t.note || 'Loan'}</span></div>
                              {alreadyPaid > 0 && <div className="accHistoryMeta">Paid: {fmtTZS(alreadyPaid)}</div>}
                            </div>
                            <div className="accHistoryAmount pos">{fmtTZS(remaining)} remaining</div>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {subAccountsWithBalance.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: '#888', marginTop: outstanding.length > 0 ? 12 : 0, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Settle Sub-account</div>
                      {subAccountsWithBalance.map(s => (
                        <div
                          key={s.id}
                          className="accHistoryRow"
                          style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 12px', marginBottom: 6, background: '#f5f5f5' }}
                          onClick={() => openPayback({
                            id: null,
                            note: s.name,
                            amount: Number(s.balance || 0),
                            subAccountId: s.id,
                            paidBack: [],
                            isSubAccountSettlement: true,
                          })}
                        >
                          <div className="accHistoryInfo">
                            <div className="accHistoryTitleRow"><span>{s.name}</span></div>
                            <div className="accHistoryMeta">Full sub-account balance</div>
                          </div>
                          <div className="accHistoryAmount pos">{fmtTZS(Number(s.balance || 0))} outstanding</div>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn" type="button" onClick={() => setShowPaybackPickerModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {showPaybackModal && paybackTxn && (
          <div className="modalBackdrop" onClick={() => setShowPaybackModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">{effectiveType === 'credit' ? 'Pay Back' : 'Receive Money'}</div>
              <div className="reimburseOriginal">
                <div className="reimburseOriginalLabel">{paybackTxn.isSubAccountSettlement ? 'Sub-account Balance' : 'Original Transaction'}</div>
                <div className="reimburseOriginalInfo">
                  <span>{paybackTxn.note || 'Loan'}</span>
                  <span className="reimburseOriginalAmt" style={{ color: '#2fbf71' }}>+{fmtTZS(paybackTxn.amount)}</span>
                </div>
                {!paybackTxn.isSubAccountSettlement && paybackTxn.paidBack && paybackTxn.paidBack.length > 0 && (
                  <div className="reimburseAlready">
                    Already paid back: {fmtTZS(paybackTxn.paidBack.reduce((s, r) => s + Number(r.amount || 0), 0))}
                  </div>
                )}
              </div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Payback Amount (TZS) — Max: {fmtTZS(Number(paybackTxn.amount || 0) - (paybackTxn.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0))}</label>
                  <input
                    inputMode="decimal"
                    value={paybackAmount}
                    onChange={e => {
                      const max = Number(paybackTxn.amount || 0) - (paybackTxn.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                      const val = Number(e.target.value || 0)
                      if (val > max) setPaybackAmount(String(max))
                      else setPaybackAmount(e.target.value)
                    }}
                    placeholder="e.g. 10000"
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={paybackDate}
                    onChange={e => setPaybackDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label style={paybackError ? { color: '#e24b4b' } : undefined}>{effectiveType === 'credit' ? 'Account To Pay From' : 'Account To Receive Money'} {paybackError ? '— Required' : ''}</label>
                  <select
                    value={paybackAccountId}
                    onChange={e => {
                      setPaybackAccountId(e.target.value);
                      setPaybackError(false);
                      const acct = accounts.find(a => a.id === e.target.value)
                      const subs = acct && Array.isArray(acct.subAccounts) ? acct.subAccounts : []
                      setPaybackSubAccountId(subs[0]?.id || '')
                    }}
                    style={paybackError ? { borderColor: '#e24b4b', background: 'rgba(226,75,75,0.05)' } : undefined}
                  >
                    <option value="">Select account</option>
                    {accounts.filter(a => a.id !== account.id).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const payAcct = accounts.find(a => a.id === paybackAccountId)
                  const paySubs = payAcct && Array.isArray(payAcct.subAccounts) ? payAcct.subAccounts : []
                  if (!paySubs.length) return null
                  return (
                    <div className="field">
                      <label>Sub-account</label>
                      <select value={paybackSubAccountId} onChange={e => setPaybackSubAccountId(e.target.value)}>
                        <option value="">Select sub-account</option>
                        {paySubs.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                })()}
                <div className="modalActions">
                  <button className="btn" type="button" onClick={() => setShowPaybackModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={async () => {
                      const amt = Number(paybackAmount || 0)
                      if (!amt || amt <= 0) { onToast?.('Enter a valid amount.'); return }
                      if (!paybackAccountId) { setPaybackError(true); return }

                      if (paybackTxn.isSubAccountSettlement) {
                        await onTransferAccount({
                          fromId: account.id,
                          toId: paybackAccountId,
                          amount: amt,
                          note: `Payback: ${paybackTxn.note}`,
                          fromSubAccountId: paybackTxn.subAccountId || null,
                          toSubAccountId: paybackSubAccountId || null,
                          date: paybackDate,
                        })
                      } else if (effectiveType === 'credit') {
                        const alreadyPaid = (paybackTxn.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                        const remaining = Number(paybackTxn.amount || 0) - alreadyPaid
                        if (amt > remaining) { onToast?.(`Cannot pay back more than ${fmtTZS(remaining)}.`); return }
                        const updatedPaidBack = [...(paybackTxn.paidBack || []), { amount: amt, date: paybackDate }]
                        await onPayCreditBack({
                          creditAccountId: account.id,
                          creditSubAccountId: paybackTxn.subAccountId || null,
                          fromAccountId: paybackAccountId,
                          fromSubAccountId: paybackSubAccountId || null,
                          amount: amt,
                          note: `Payback: ${paybackTxn.note || 'Credit'}`,
                          date: paybackDate,
                          patchTxn: { id: paybackTxn.id, fields: { paidBack: updatedPaidBack } }
                        })
                      } else {
                        const alreadyPaid = (paybackTxn.paidBack || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                        const remaining = Number(paybackTxn.amount || 0) - alreadyPaid
                        if (amt > remaining) { onToast?.(`Cannot pay back more than ${fmtTZS(remaining)}.`); return }
                        const updatedPaidBack = [...(paybackTxn.paidBack || []), { amount: amt, date: paybackDate }]
                        await onTransferAccount({
                          fromId: account.id,
                          toId: paybackAccountId,
                          amount: amt,
                          note: `Payback: ${paybackTxn.note || 'Loan'}`,
                          fromSubAccountId: paybackTxn.subAccountId || null,
                          toSubAccountId: paybackSubAccountId || null,
                          date: paybackDate,
                          patchTxn: { id: paybackTxn.id, fields: { paidBack: updatedPaidBack } }
                        })
                      }

                      setShowPaybackModal(false)
                      setPaybackTxn(null)
                      onToast?.('Payback saved.')
                    }}
                  >
                    Save Payback
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  <label>Group</label>
                  <select
                    value={editGroupId}
                    onChange={(e) => setEditGroupId(e.target.value)}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Type</label>
                  <select
                    value={editAccountType || currentGroup?.type || 'debit'}
                    onChange={(e) => setEditAccountType(e.target.value)}
                  >
                    <option value="debit">Debit</option>
                    <option value="loan">Loan</option>
                    <option value="credit">Credit</option>
                    <option value="asset">Asset</option>
                  </select>
                </div>
                {((editAccountType || currentGroup?.type || 'debit') === 'debit' || !currentGroup) && (
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
          showMergeModal && (
            <div className="modalBackdrop" onClick={() => setShowMergeModal(false)}>
              <div className="modalCard" onClick={(e) => e.stopPropagation()}>
                <div className="modalTitle">Merge Into "{account.name}"</div>
                <div className="small" style={{ color: '#8b90b2', marginBottom: 12 }}>
                  Pick the duplicate account to fold in. Its balance moves onto "{account.name}",
                  and the duplicate is archived (kept for history, not deleted).
                </div>
                <div className="field">
                  <label>Merge this account in</label>
                  <select value={mergeFromId} onChange={(e) => setMergeFromId(e.target.value)}>
                    {mergeCandidates.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({fmtTZS(a.balance || 0)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="modalActions">
                  <button className="btn" type="button" onClick={() => setShowMergeModal(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={handleConfirmMerge}>
                    Merge
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

        {showAddBucketModal && (
          <div className="modalBackdrop" onClick={() => setShowAddBucketModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Add Bucket</div>
              <div className="field">
                <label>Bucket Name</label>
                <input
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  placeholder="e.g. Home Renovation"
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Initial Amount (TZS)</label>
                <input
                  inputMode="decimal"
                  value={newBucketAmount}
                  onChange={(e) => setNewBucketAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="modalActions">
                <button className="btn" type="button" onClick={() => setShowAddBucketModal(false)}>Cancel</button>
                <button className="btn primary" type="button" onClick={handleAddBucket}>Add</button>
              </div>
            </div>
          </div>
        )}

        {showReallocateModal && (
          <div className="modalBackdrop" onClick={() => setShowReallocateModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Reallocate Between Buckets</div>
              <div className="field">
                <label>From Bucket</label>
                <select value={reallocFromId} onChange={(e) => setReallocFromId(e.target.value)}>
                  {(account.subAccounts || []).map(s => (
                    <option key={s.id} value={s.id}>{s.isUnallocated ? 'Unallocated' : s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>To Bucket</label>
                <select value={reallocToId} onChange={(e) => setReallocToId(e.target.value)}>
                  {(account.subAccounts || []).map(s => (
                    <option key={s.id} value={s.id}>{s.isUnallocated ? 'Unallocated' : s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Amount (TZS)</label>
                <input
                  inputMode="decimal"
                  value={reallocAmount}
                  onChange={(e) => setReallocAmount(e.target.value)}
                  placeholder="e.g. 500000"
                  autoFocus
                />
              </div>
              <div className="modalActions">
                <button className="btn" type="button" onClick={() => setShowReallocateModal(false)}>Cancel</button>
                <button className="btn primary" type="button" onClick={async () => {
                  if (!reallocFromId || !reallocToId || reallocFromId === reallocToId) return
                  await onReallocateBuckets({ accountId: account.id, fromSubId: reallocFromId, toSubId: reallocToId, amount: reallocAmount })
                  setShowReallocateModal(false)
                  setReallocAmount('')
                }}>Move</button>
              </div>
            </div>
          </div>
        )}

        {primaryTab === 'activity' && (
          <div className="accHistory">
            <div className="accHistoryTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {filterSubAccountId
                  ? (() => {
                      const sub = account.subAccounts?.find(s => s.id === filterSubAccountId)
                      const label = sub?.isUnallocated ? 'Unallocated' : (sub?.name || (effectiveType === 'debit' ? 'Bucket' : 'Sub-account'))
                      return `${label} activity`
                    })()
                  : activeTab === 'future' ? 'Future Expenses' : activeTab === 'valuations' ? 'Valuations' : 'Recent activity'
                }
              </span>

              {showExportModal && (
                <div className="modalBackdrop" onClick={() => setShowExportModal(false)}>
                  <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
                    <div className="modalTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Export Settings</span>
                      <button className="iconBtn" type="button" onClick={() => setShowExportModal(false)} style={{ fontSize: 18 }}>✕</button>
                    </div>
                    <div className="accQuickForm">
                      <div className="field">
                        <label>Column for IN transactions</label>
                        <select value={exportInLabel} onChange={(e) => {
                          setExportInLabel(e.target.value)
                          setExportOutLabel(e.target.value === 'Credit' ? 'Debit' : 'Credit')
                        }}>
                          <option value="Credit">Credit</option>
                          <option value="Debit">Debit</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Column for OUT transactions</label>
                        <select value={exportOutLabel} onChange={(e) => {
                          setExportOutLabel(e.target.value)
                          setExportInLabel(e.target.value === 'Credit' ? 'Debit' : 'Credit')
                        }}>
                          <option value="Debit">Debit</option>
                          <option value="Credit">Credit</option>
                        </select>
                      </div>
                      <div style={{ fontSize: 12, color: '#999', margin: '4px 0 8px' }}>
                        Preview: IN → {exportInLabel} | OUT → {exportOutLabel}
                      </div>
                      <div className="modalActions">
                        <button className="btn" type="button" onClick={() => setShowExportModal(false)}>Cancel</button>
                        <button className="btn primary" type="button" onClick={exportToCSV}>Download CSV</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                {entries.length > 0 && (
                  <button
                    className="miniBtn"
                    type="button"
                    style={{ fontSize: 11 }}
                    onClick={() => setShowExportModal(true)}
                  >
                    Export
                  </button>
                )}
                {filterSubAccountId && (
                  <button
                    className="miniBtn"
                    type="button"
                    style={{ fontSize: 11 }}
                    onClick={() => setFilterSubAccountId(null)}
                  >
                    Show All
                  </button>
                )}
                {effectiveType === 'debit' && activeTab === 'activity' && (
                  <button
                    className="miniBtn"
                    type="button"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setSelectMode(m => !m);
                      setSelectedEntryIds([]);
                    }}
                  >
                    {selectMode ? 'Cancel' : 'Select'}
                  </button>
                )}
              </div>
            </div>

            <div className="accTabs">
              {effectiveType === 'asset' && (
                <div
                  className={`accTab ${activeTab === 'trends' ? 'active' : ''}`}
                  onClick={() => setActiveTab('trends')}
                >
                  Trends
                </div>
              )}
              <div
                className={`accTab ${activeTab === 'activity' ? 'active' : ''}`}
                onClick={() => setActiveTab('activity')}
              >
                History
              </div>
              <div
                className={`accTab ${activeTab === 'future' ? 'active' : ''}`}
                onClick={() => setActiveTab('future')}
              >
                Future
                {(() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const count = accountTxns.filter(t => t.accountId === account.id && t.date > today).length;
                  return count > 0 ? <span className="accTabBadge">{count}</span> : null;
                })()}
              </div>
              {effectiveType === 'debit' && (
                <div
                  className={`accTab ${activeTab === 'duefrom' ? 'active' : ''}`}
                  onClick={() => setActiveTab('duefrom')}
                >
                  Due From
                  {dueFromGroups.length > 0 && <span className="accTabBadge">{dueFromGroups.length}</span>}
                </div>
              )}
              {effectiveType === 'asset' && (
                <div
                  className={`accTab ${activeTab === 'valuations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('valuations')}
                >
                  Valuations
                  {(() => {
                    const count = accountTxns.filter(t => t.accountId === account.id && t.kind === 'valuation').length;
                    return count > 0 ? <span className="accTabBadge">{count}</span> : null;
                  })()}
                </div>
              )}
            </div>

            {activeTab === 'trends' ? (
              <TrendsTab trends={trends} />
            ) : activeTab === 'duefrom' ? (
              dueFromGroups.length === 0 ? (
                <div className="emptyRow">Nothing marked as Due From yet.</div>
              ) : (
                dueFromGroups.map(group => {
                  const sourceAcct = accounts.find(a => a.id === group.accountId);
                  return (
                    <div className="accHistoryCard" key={group.accountId}>
                      <div className="accHistoryHead">
                        <div className="accHistoryInfo">
                          <div className="accHistoryTitleRow"><span>{sourceAcct?.name || 'Unknown account'}</span></div>
                          <div className="accHistoryMeta">{group.items.length} transaction{group.items.length === 1 ? '' : 's'}</div>
                        </div>
                        <div className="accHistoryTotals">
                          <div className="totalGroup">
                            <div className="totalValue out">{fmtTZS(group.total)}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '0 16px 12px' }}>
                        <button
                          className="btn primary"
                          type="button"
                          style={{ width: '100%' }}
                          onClick={() => {
                            setSettleGroup(group);
                            setSettleDate(new Date().toISOString().slice(0, 10));
                          }}
                        >
                          Settle {fmtTZS(group.total)} from {sourceAcct?.name || 'account'}
                        </button>
                      </div>
                      <div className="accHistoryBody">
                        {group.items.map(t => (
                          <div className="accHistoryRow" key={t.id} style={{ cursor: 'default' }}>
                            <div className="accHistoryIcon">{(t.note || 'A').slice(0, 1).toUpperCase()}</div>
                            <div className="accHistoryInfo">
                              <div className="accHistoryTitleRow"><span>{t.note || 'Transaction'}</span></div>
                              <div className="accHistoryMeta">{t.date}</div>
                            </div>
                            <div className="accHistoryAmount neg">{fmtTZS(t.amount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )
            ) : grouped.length === 0 ? (
              <div className="emptyRow">
                {activeTab === 'future' ? 'No future expenses planned.' : activeTab === 'valuations' ? 'No valuations yet.' : 'No activity yet.'}
              </div>
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
                        const kindLabel = t.kind === 'credit' && effectiveType === 'loan'
                          ? 'Loan'
                          : (t.kind ? t.kind.charAt(0).toUpperCase() + t.kind.slice(1) : "");

                        let meta = subName || (t.kind === "transfer" ? "Transfer" : (kindLabel || "Account"));
                        if (t.relatedAccountId) {
                          const relatedAcct = accounts.find(a => a.id === t.relatedAccountId);
                          if (relatedAcct) {
                            const directionSymbol = t.direction === 'in' ? 'From' : 'To';
                            meta = subName ? `${directionSymbol} ${relatedAcct.name} • ${subName}` : `${directionSymbol} ${relatedAcct.name}`;
                          }
                        }
                        if (t.kind === 'txn' && t.clientId) {
                          const clientName = clients.find(c => c.id === t.clientId)?.name;
                          if (clientName) {
                            meta = subName ? `${clientName} • ${subName}` : clientName;
                          }
                        }

                        const isFuture = t.date > new Date().toISOString().slice(0, 10);
                        const eligible = isDueFromEligible(t);
                        const isSelected = selectedEntryIds.includes(t.id);
                        const rowClick = () => {
                          if (selectMode) {
                            if (!eligible) return;
                            setSelectedEntryIds(ids => (
                              ids.includes(t.id) ? ids.filter(id => id !== t.id) : [...ids, t.id]
                            ));
                          } else {
                            handleOpenTxnEdit(t);
                          }
                        };
                        const sourceAcctName = t.dueFrom
                          ? accounts.find(a => a.id === t.dueFrom.accountId)?.name || 'account'
                          : null;
                        return (
                          <div
                            className={`accHistoryRow ${selectMode && !eligible ? 'accHistoryRowDisabled' : ''}`}
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={rowClick}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") rowClick();
                            }}
                          >
                            {selectMode ? (
                              <div className={`selectCheckbox ${isSelected ? 'checked' : ''} ${!eligible ? 'disabled' : ''}`}>
                                {isSelected ? '✓' : ''}
                              </div>
                            ) : (
                              <div className="accHistoryIcon">
                                {(title || "A").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="accHistoryInfo">
                              <div className="accHistoryTitleRow">
                                <span style={isFuture ? { fontStyle: 'italic', opacity: 0.7 } : {}}>{title}</span>
                                {isFuture && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7, padding: '2px 6px', background: 'rgba(0,0,0,0.1)', borderRadius: 4, fontStyle: 'normal' }}>Pending</span>}
                              </div>
                              <div className="accHistoryMeta" style={isFuture ? { fontStyle: 'italic', opacity: 0.7 } : {}}>{meta}</div>
                              {t.paidBack && t.paidBack.length > 0 && (
                                <div className="reimbursedBadge">
                                  ✓ Paid back {fmtTZS(t.paidBack.reduce((s, r) => s + Number(r.amount || 0), 0))}
                                </div>
                              )}
                              {t.dueFrom?.status === 'pending' && (
                                <div className="dueFromBadge pending">Due from {sourceAcctName}</div>
                              )}
                              {t.dueFrom?.status === 'received' && (
                                <div className="dueFromBadge received">✓ Received from {sourceAcctName}</div>
                              )}
                            </div>
                            <div className={`accHistoryAmount ${t.direction === "in" ? "pos" : "neg"}`} style={isFuture ? { fontStyle: 'italic', opacity: 0.7 } : {}}>
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
        )}

        {primaryTab === 'goals' && (
          <div className="accHistory">
            {renderPlannerTab()}
          </div>
        )}

        {showAddPlanModal && (
          <div className="modalBackdrop" style={{ zIndex: 4000 }} onClick={() => setShowAddPlanModal(false)}>
            <div className="modalCard" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
              <div className="modalTitle">Add Savings Goal</div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Goal Name</label>
                  <input
                    type="text"
                    placeholder="e.g. School Fees, Rent, Holiday"
                    value={newPlanName}
                    onChange={e => setNewPlanName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Target Amount (TZS)</label>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={newPlanAmount}
                    onChange={e => setNewPlanAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Target Type</label>
                  <select value={newPlanType} onChange={e => setNewPlanType(e.target.value)}>
                    <option value="expense">Planned Expense</option>
                    <option value="budget">Monthly Budget</option>
                  </select>
                </div>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setShowAddPlanModal(false)}>Cancel</button>
                  <button className="btn primary" type="button" onClick={handleAddPlan}>Add to Planner</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectMode && (
        <div className="selectActionBar">
          <span>{selectedEntryIds.length} selected{selectedEntryIds.length > 0 ? ` · ${fmtTZS(selectedTotal)}` : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="button" onClick={() => { setSelectMode(false); setSelectedEntryIds([]); }}>
              Done
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={selectedEntryIds.length === 0}
              onClick={() => setShowMarkDueFromModal(true)}
            >
              Mark as Due From
            </button>
          </div>
        </div>
      )}

      {showMarkDueFromModal && (
        <div className="modalBackdrop" onClick={() => setShowMarkDueFromModal(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Mark as Due From</div>
            <div className="accQuickForm">
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
                {selectedEntryIds.length} transaction{selectedEntryIds.length === 1 ? '' : 's'} selected
              </div>
              {dueFromSourceAccounts.length === 0 ? (
                <div style={{ color: '#888' }}>No other debit accounts available to select as the source.</div>
              ) : (
                <div className="field">
                  <label>Expected from account</label>
                  <select value={markDueFromAccountId} onChange={e => setMarkDueFromAccountId(e.target.value)}>
                    {dueFromSourceAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Date</label>
                <input type="date" value={markDueFromDate} onChange={e => setMarkDueFromDate(e.target.value)} />
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" type="button" onClick={() => setShowMarkDueFromModal(false)}>Cancel</button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!markDueFromAccountId}
                  onClick={async () => {
                    await onMarkDueFrom?.({
                      entryIds: selectedEntryIds,
                      fromAccountId: markDueFromAccountId,
                      date: markDueFromDate
                    });
                    setShowMarkDueFromModal(false);
                    setSelectMode(false);
                    setSelectedEntryIds([]);
                  }}
                >
                  Mark {selectedEntryIds.length}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {settleGroup && (() => {
        const sourceAcct = accounts.find(a => a.id === settleGroup.accountId);
        return (
          <div className="modalBackdrop" onClick={() => setSettleGroup(null)}>
            <div className="modalCard" onClick={e => e.stopPropagation()}>
              <div className="modalTitle">Settle Due From</div>
              <div className="accQuickForm">
                <div className="reimburseOriginal">
                  <div className="reimburseOriginalLabel">From {sourceAcct?.name || 'account'}</div>
                  <div className="reimburseOriginalInfo">
                    <span>{settleGroup.items.length} transaction{settleGroup.items.length === 1 ? '' : 's'}</span>
                    <span className="reimburseOriginalAmt" style={{ color: '#2fbf71' }}>+{fmtTZS(settleGroup.total)}</span>
                  </div>
                </div>
                <div className="field">
                  <label>Date received</label>
                  <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn" type="button" onClick={() => setSettleGroup(null)}>Cancel</button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={async () => {
                      await onSettleDueFrom?.({
                        toAccountId: account.id,
                        fromAccountId: settleGroup.accountId,
                        entryIds: settleGroup.items.map(t => t.id),
                        date: settleDate
                      });
                      setSettleGroup(null);
                    }}
                  >
                    Settle {fmtTZS(settleGroup.total)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Account FAB Action System */}
      {!isAnyModalOpen && !selectMode && (
        <div className="accountFabContainer">
          {showFabMenu && (
            <div className="accountFabOverlay" onClick={() => setShowFabMenu(false)}>
              <div className="accountFabMenu" onClick={e => e.stopPropagation()}>
                {/* Standard Debit/Wallet Actions */}
                {(effectiveType === 'debit' || effectiveType === 'wallet') && (
                  <>
                    <button
                      className="accountFabItem btnGreen"
                      onClick={() => {
                        setDirection("in");
                        setMode("adjust");
                        setSubAccountId(Array.isArray(account.subAccounts) && account.subAccounts.length ? account.subAccounts[0].id : "");
                        setShowFabMenu(false);
                      }}
                    >
                      <span>Add Money</span>
                      <div className="fabIcon">+</div>
                    </button>
                    <button
                      className="accountFabItem btnYellow"
                      onClick={() => {
                        setMode("transfer");
                        setShowFabMenu(false);
                      }}
                    >
                      <span>Transfer Funds</span>
                      <div className="fabIcon">⇄</div>
                    </button>
                  </>
                )}

                {/* Asset Specific Actions */}
                {effectiveType === 'asset' && (
                  <>
                    <button
                      className="accountFabItem btnGreen"
                      onClick={() => {
                        setShowPurchaseModal(true);
                        setShowFabMenu(false);
                      }}
                    >
                      <span>Buy Asset</span>
                      <div className="fabIcon">+</div>
                    </button>
                    <button
                      className="accountFabItem btnYellow"
                      onClick={() => {
                        setShowSaleModal(true);
                        setShowFabMenu(false);
                      }}
                    >
                      <span>Sell Asset</span>
                      <div className="fabIcon">−</div>
                    </button>
                    <button
                      className="accountFabItem btnYellow"
                      onClick={() => {
                        const info = calculateAssetMetrics(account, accountTxns, effectiveType)
                        setValuationPrice(info.unitPrice || "")
                        setShowValuationModal(true)
                        setShowFabMenu(false);
                      }}
                    >
                      <span>Update Valuation</span>
                      <div className="fabIcon">↑</div>
                    </button>
                  </>
                )}

                {/* Credit/Loan Specific Actions */}
                {(effectiveType === 'credit' || effectiveType === 'loan') && (
                  <>
                    <button
                      className="accountFabItem btnGreen"
                      onClick={() => {
                        setShowCreditModal(true);
                        setShowFabMenu(false);
                      }}
                    >
                      <span>{effectiveType === 'loan' ? 'Issue Loan' : 'Add Credit'}</span>
                      <div className="fabIcon">+</div>
                    </button>
                    <button
                      className="accountFabItem btnYellow"
                      onClick={() => {
                        setShowPaybackPickerModal(true);
                        setShowFabMenu(false);
                      }}
                    >
                      <span>{effectiveType === 'loan' ? 'Receive Payback' : 'Pay Back'}</span>
                      <div className="fabIcon">⇄</div>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          <button
            className={`accountFabMain ${showFabMenu ? 'active' : ''}`}
            onClick={() => setShowFabMenu(!showFabMenu)}
          >
            {showFabMenu ? '✕' : '+'}
          </button>
        </div>
      )}
    </div>
  );
}
