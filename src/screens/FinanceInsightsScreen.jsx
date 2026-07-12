import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, fmtCompact, todayISO, calculateAssetMetrics, monthsBetween, daysBetween } from '../money'
import { TransactionDetail } from '../components/TransactionDetail'
import { collectionStatus } from '../utils/pipeline'

// Categorical palette for allocation-category segments — green/red are reserved
// for the breakeven status (bar/line color) and never reused as a category hue.
const ALLOC_PALETTE = ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7', '#e87ba4', '#eb6834']
const ALLOC_OTHER_COLOR = '#94a3b8'
const ALLOC_SURPLUS_COLOR = '#cbd5e1'
const BREAKEVEN_GOOD = '#22c55e'
const BREAKEVEN_BAD = '#ef4444'
const ALLOC_OTHER_KEY = '__other__'

export function FinanceInsightsScreen() {
  const {
    activeLedger, accounts, accountTxns, txns, clients,
    expenseCats, incomeCats, categories, categoryMeta, settings, show, updateTxn, delTxn,
    activeLedgerId, ALL_LEDGERS_ID, setShowLedgerPicker, addReimbursement
  } = useAppContext()

  const cosCats = useMemo(() => new Set(categories?.cos || []), [categories])
  const oppsCats = useMemo(() => new Set(categories?.opps || []), [categories])

  // Collections (personal-ledger pipeline) are the inflow-equivalent of legacy income
  // transactions, but their recognized amount is net of any compliance held-back sum.
  const isIncomeType = (t) => t.type === 'income' || t.type === 'collection'
  const incomeAmt = (t) => t.type === 'collection' ? collectionStatus(t).net : Number(t.amount || 0)

  const [txnsMainTab, setTxnsMainTab] = useState('activity') 
  const [viewGranularity, setViewGranularity] = useState('year') 
  const [statPeriod, setStatPeriod] = useState(() => new Date().toISOString().slice(0, 4))
  const [insightTab, setInsightTab] = useState('cashflow')
  const [monthlyViewMode, setMonthlyViewMode] = useState('actual')
  const [infoModal, setInfoModal] = useState(null)
  
  // Screen States
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [breakdownModal, setBreakdownModal] = useState(null)
  const [showGranularityMenu, setShowGranularityMenu] = useState(false)

  // Reimbursement States
  const [showReimburseModal, setShowReimburseModal] = useState(false)
  const [reimburseTxn, setReimburseTxn] = useState(null)
  const [reimburseAmount, setReimburseAmount] = useState('')
  const [reimburseAccountId, setReimburseAccountId] = useState('')
  const [reimburseSubAccountId, setReimburseSubAccountId] = useState('')
  const [reimburseDate, setReimburseDate] = useState(todayISO())
  const [reimburseError, setReimburseError] = useState(false)
  
  // Clear amount when opening modal but keep the default in state
  const handleOpenReimburse = (t) => {
    const alreadyReimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const val = String(Number(t.amount || 0) - alreadyReimbursed)
    setReimburseTxn(t)
    setReimburseAmount(val)
    setReimburseDate(todayISO())
    setShowReimburseModal(true)
  }

  const statYear = Number(statPeriod.slice(0, 4))
  const groupById = useMemo(() => new Map((activeLedger.groups || []).map(g => [g.id, g])), [activeLedger.groups])
  const visibleAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  function shiftPeriod(delta) {
    if (viewGranularity === 'year') setStatPeriod(String(statYear + delta))
    else if (viewGranularity === 'month') {
      const d = new Date(statPeriod + '-01'); d.setMonth(d.getMonth() + delta)
      setStatPeriod(d.toISOString().slice(0, 7))
    } else {
      const d = new Date(statPeriod); d.setDate(d.getDate() + (delta * 7))
      setStatPeriod(d.toISOString().slice(0, 10))
    }
  }

  function computeAccruedForAccount(account, balanceType = 'current') {
    const creditEntries = accountTxns.filter((t) => t.accountId === account.id && t.kind === "credit");
    const today = new Date().toISOString().slice(0, 10);
    let accrued = 0;
    creditEntries.forEach((t) => {
      if (balanceType === 'current' && t.date > today) return;
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

  function getAccountBalance(account, balanceType = 'current') {
    const today = new Date().toISOString().slice(0, 10);
    const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];
    const getBaseBalance = (acc) => {
      let b = Number(acc.balance || 0);
      if (balanceType === 'current') {
        const futureTxns = accountTxns.filter(t => t.accountId === acc.id && t.date > today);
        futureTxns.forEach(t => {
          const amt = Number(t.amount || 0);
          if (t.direction === 'out') b += amt;
          else if (t.direction === 'in') b -= amt;
        });
      }
      return b;
    };
    const base = subs.length > 0
      ? subs.reduce((s, sub) => (activeLedgerId === "all" || sub.ledgerId === activeLedgerId ? s + getBaseBalance(sub) : s), 0)
      : getBaseBalance(account);

    const groupType = account.accountType || groupById.get(account.groupId)?.type;
    if (groupType === "credit") return base + computeAccruedForAccount(account, balanceType);
    if (groupType === "asset") {
      if (subs.length > 0) return base;
      let cleanBase = 0;
      const txnsList = accountTxns.filter(t => t.accountId === account.id);
      for (const t of txnsList) {
        if (t.kind === 'valuation') continue;
        if (balanceType === 'current' && t.date > today) continue;
        const amt = Number(t.amount || 0);
        if (t.direction === 'in') cleanBase += amt;
        if (t.direction === 'out') cleanBase -= amt;
      }
      const info = calculateAssetMetrics(account, accountTxns, groupType, balanceType === 'current' ? today : null);
      if (info.hasData) {
        const uninvestedCash = cleanBase - (info.costBasis || 0) + (info.realizedGain || 0);
        return (info.value || 0) + uninvestedCash;
      }
    }
    if (subs.length > 0) return base;
    if (activeLedgerId !== "all" && account.ledgerId !== activeLedgerId) return 0;
    return base;
  }

  const totals = useMemo(() => {
    let assets = 0, liabilities = 0, capitalDeployed = 0, invested = 0, loanBook = 0, liquidCash = 0;
    let landCapital = 0, sharesCapital = 0;
    for (const a of visibleAccounts) {
      const g = groupById.get(a.groupId);
      const type = a.accountType || g?.type;
      const val = getAccountBalance(a);
      if (type === "credit") { liabilities += val; capitalDeployed -= val; }
      else if (type === "loan") { assets += val; loanBook += val; capitalDeployed += val; invested += val; }
      else if (type === "asset") {
        assets += val;
        const info = calculateAssetMetrics(a, accountTxns, 'asset');
        capitalDeployed += (info.costBasis || 0); invested += (info.costBasis || 0);
        const name = (a.name || '').toLowerCase(), gName = (g?.name || '').toLowerCase();
        const isLand = ['land', 'plot', 'property', 'shamba', 'farm', 'estate'].some(k => name.includes(k) || gName.includes(k));
        if (isLand) landCapital += (info.costBasis || 0);
        else sharesCapital += (info.costBasis || 0);
      } else { assets += val; liquidCash += val; capitalDeployed += val; invested += val; }
    }
    const now = new Date(), threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(now.getMonth() - 3);
    const iso3m = threeMonthsAgo.toISOString().slice(0, 10);
    const recentTxns = txns.filter(t => t.date >= iso3m);
    let inc3m = 0, exp3m = 0;
    recentTxns.forEach(t => { if (isIncomeType(t)) inc3m += incomeAmt(t); else if (t.type === 'expense' || t.type === 'cos' || t.type === 'opps') exp3m += Number(t.amount || 0); });
    const avgMonthlyProfit = (inc3m - exp3m) / 3;
    const monthlyReturn = capitalDeployed > 0 ? (avgMonthlyProfit / capitalDeployed) * 100 : 0;
    let totalWeightedRate = 0;
    visibleAccounts.forEach(a => { if (a.accountType === 'credit') totalWeightedRate += (getAccountBalance(a) * (Number(a.creditRate || 0) / 1200)); });
    const costOfCapital = liabilities > 0 ? (totalWeightedRate / liabilities) : 0;
    const coverage = costOfCapital > 0 ? (monthlyReturn / costOfCapital) : (liabilities > 0 ? 0 : 999);
    return { assets, liabilities, netWorth: assets - liabilities, capitalDeployed, invested, monthlyReturn, coverage, loanBook, liquidCash, landCapital, sharesCapital };
  }, [visibleAccounts, groupById, activeLedgerId, accountTxns, txns]);

  const combinedTxns = useMemo(() => {
    const baseTxns = txns.map(t => {
      const clientName = t.clientId ? clients.find(c => c.id === t.clientId)?.name : null
      let sub = t.note || ''
      if (clientName) sub = sub ? `${clientName} • ${sub}` : clientName
      return { id: `txn-${t.id}`, date: t.date, title: t.category || (isIncomeType(t) ? 'Income' : 'Expense'), sub, amount: isIncomeType(t) ? incomeAmt(t) : Number(t.amount || 0), direction: isIncomeType(t) ? 'in' : 'out', type: t.type, raw: t }
    })
    const acctTxns = accountTxns.filter(t => t.kind !== 'txn').map(t => {
      const acct = accounts.find(a => a.id === t.accountId)
      return { id: `acct-${t.id}`, date: t.date, title: t.note || 'Balance Update', sub: acct ? acct.name : '', amount: Number(t.amount || 0), direction: t.direction, type: t.direction === 'in' ? 'income' : 'expense', raw: t }
    })
    return [...baseTxns, ...acctTxns].sort((a, b) => b.date.localeCompare(a.date))
  }, [txns, accountTxns, accounts, clients])

  const insightFilteredTxns = useMemo(() => {
    const today = todayISO()
    return combinedTxns.filter(t => {
      const date = t.date || today
      if (txnsMainTab === 'activity' && date > today) return false
      if (txnsMainTab === 'future' && date <= today) return false
      if (viewGranularity === 'month') return date.startsWith(statPeriod)
      if (viewGranularity === 'year') return Number(date.substring(0, 4)) === statYear
      return true
    })
  }, [combinedTxns, viewGranularity, statPeriod, statYear, txnsMainTab])

  const monthlyStats = useMemo(() => {
    const stats = new Map()
    const emptyStat = () => ({ inc: 0, exp: 0, actualInc: 0, actualExp: 0, all: 0, actualAll: 0, allocByCat: {}, actualAllocByCat: {}, growth: 0, actualGrowth: 0 })
    txns.forEach(t => {
      const date = t.date || todayISO()
      if (viewGranularity === 'month' && !date.startsWith(statPeriod)) return
      if (viewGranularity === 'year' && Number(date.slice(0, 4)) !== statYear) return
      const key = viewGranularity === 'year' ? date.slice(0, 7) : date
      if (!stats.has(key)) stats.set(key, emptyStat())
      const e = stats.get(key), amt = Number(t.amount || 0), act = date <= todayISO()
      const isExp = t.type === 'expense'
        || (t.type === 'cos' && cosCats.has(t.category))
        || (t.type === 'opps' && oppsCats.has(t.category))
      if (isIncomeType(t)) { const inc = incomeAmt(t); e.inc += inc; if (act) e.actualInc += inc }
      else if (isExp) { e.exp += amt; if (act) e.actualExp += amt }
      else if (t.type === 'allocation') {
        const cat = t.category || 'Uncategorized'
        e.all += amt; e.allocByCat[cat] = (e.allocByCat[cat] || 0) + amt
        if (act) { e.actualAll += amt; e.actualAllocByCat[cat] = (e.actualAllocByCat[cat] || 0) + amt }
      }
      else if (t.type === 'growth') {
        e.growth += amt
        if (act) e.actualGrowth += amt
      }
    })
    const res = []
    if (viewGranularity === 'year') {
      for (let m = 1; m <= 12; m++) {
        const k = `${statYear}-${String(m).padStart(2, '0')}`, dt = new Date(statYear, m - 1, 1), d = stats.get(k) || emptyStat()
        res.push({ key: k, label: dt.toLocaleString('default', { month: 'short' }), ...d })
      }
    }
    return res
  }, [statYear, viewGranularity, txns, statPeriod, cosCats, oppsCats])

  // Fixed, ledger-defined order so a category's color/slot never shifts across
  // months (color follows the entity, not its rank). Anything beyond the
  // palette's 6 slots folds into "Other" rather than cycling/generating a hue.
  const allocCategoryOrder = useMemo(() => (
    [...(categories.allocation || [])]
      .sort((a, b) => (categoryMeta.allocation?.[a]?.priority ?? Infinity) - (categoryMeta.allocation?.[b]?.priority ?? Infinity))
      .slice(0, ALLOC_PALETTE.length)
  ), [categories, categoryMeta])

  const BreakevenChart = () => {
    const todayKey = todayISO().slice(0, 7)

    // Chronological Jan->Dec, each row annotated with its stacked segments.
    const chartData = useMemo(() => monthlyStats.map(m => {
      const total = m.inc - m.exp - m.all - m.growth
      const isPositive = total >= 0
      const row = { key: m.key, label: m.label, total, isProjected: m.key > todayKey }
      let otherAlloc = 0
      allocCategoryOrder.forEach((cat, i) => { row[`cat${i}`] = isPositive ? (m.allocByCat[cat] || 0) : 0 })
      Object.entries(m.allocByCat).forEach(([cat, amt]) => { if (!allocCategoryOrder.includes(cat)) otherAlloc += amt })
      row.other = isPositive ? otherAlloc : 0
      row.surplus = isPositive ? total : 0
      row.deficit = isPositive ? 0 : total
      return row
    }), [monthlyStats, allocCategoryOrder, todayKey])

    const hasOther = chartData.some(r => r.other > 0)

    // Cumulative running total for the year — its own single axis (separate
    // panel from the bars, per the dual-axis anti-pattern).
    const cumData = useMemo(() => {
      let running = 0
      const lastActualIdx = chartData.reduce((acc, r, i) => (r.key <= todayKey ? i : acc), -1)
      return chartData.map((r, i) => {
        running += r.total
        return {
          key: r.key, label: r.label, cum: running,
          cumActual: i <= lastActualIdx ? running : null,
          cumProjected: i >= lastActualIdx ? running : null
        }
      })
    }, [chartData, todayKey])

    const cumMax = Math.max(...cumData.map(d => d.cum), 0)
    const cumMin = Math.min(...cumData.map(d => d.cum), 0)
    const cumRange = (cumMax - cumMin) || 1
    const zeroOffset = cumMax / cumRange

    const openMonth = (monthKey, type, category, label) => {
      setBreakdownModal({ month: monthKey, type, category, title: `${label} ${type === 'all' ? 'Overview' : type === 'allocation' ? (category === ALLOC_OTHER_KEY ? 'Other Lifestyle' : (category || 'Lifestyle')) : type[0].toUpperCase()+type.slice(1)}` })
    }

    return (
      <div className="card" style={{ padding: '20px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Breakeven Progress</div>
          <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '4px 8px', borderRadius: 8 }}>{statYear}</div>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>Tap a bar to see the transactions behind it</div>

        <div style={{ width: '100%', height: 190 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} width={40} />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Tooltip
                formatter={(value, name) => [fmtCompact(value), name]}
                labelFormatter={label => label}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f1f5f9' }}
              />
              {allocCategoryOrder.map((cat, i) => (
                <Bar key={cat} dataKey={`cat${i}`} name={cat} stackId="s" onClick={(_, idx) => openMonth(chartData[idx].key, 'allocation', cat, chartData[idx].label)}>
                  {chartData.map((row, idx) => <Cell key={idx} fill={ALLOC_PALETTE[i]} fillOpacity={row.isProjected ? 0.45 : 1} cursor="pointer" />)}
                </Bar>
              ))}
              {hasOther && (
                <Bar dataKey="other" name="Other" stackId="s" onClick={(_, idx) => openMonth(chartData[idx].key, 'allocation', ALLOC_OTHER_KEY, chartData[idx].label)}>
                  {chartData.map((row, idx) => <Cell key={idx} fill={ALLOC_OTHER_COLOR} fillOpacity={row.isProjected ? 0.45 : 1} cursor="pointer" />)}
                </Bar>
              )}
              <Bar dataKey="surplus" name="Uncommitted surplus" stackId="s" onClick={(_, idx) => openMonth(chartData[idx].key, 'all', null, chartData[idx].label)}>
                {chartData.map((row, idx) => <Cell key={idx} fill={ALLOC_SURPLUS_COLOR} fillOpacity={row.isProjected ? 0.45 : 1} cursor="pointer" />)}
              </Bar>
              <Bar dataKey="deficit" name="Deficit" stackId="s" onClick={(_, idx) => openMonth(chartData[idx].key, 'all', null, chartData[idx].label)}>
                {chartData.map((row, idx) => <Cell key={idx} fill={BREAKEVEN_BAD} fillOpacity={row.isProjected ? 0.45 : 1} cursor="pointer" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 11, color: '#64748b', margin: '10px 0 20px' }}>
          {allocCategoryOrder.map((cat, i) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 3, background: ALLOC_PALETTE[i] }} />{cat}
            </div>
          ))}
          {hasOther && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 9, height: 9, borderRadius: 3, background: ALLOC_OTHER_COLOR }} />Other</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 9, height: 9, borderRadius: 3, background: ALLOC_SURPLUS_COLOR }} />Uncommitted surplus</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 9, height: 9, borderRadius: 3, background: BREAKEVEN_BAD }} />Below breakeven</div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>Cumulative for {statYear}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Running total — green above breakeven, red below</div>
        <div style={{ width: '100%', height: 110 }}>
          <ResponsiveContainer>
            <ComposedChart data={cumData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor={BREAKEVEN_GOOD} />
                  <stop offset={Math.max(0, Math.min(1, zeroOffset))} stopColor={BREAKEVEN_BAD} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis domain={[cumMin, cumMax]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCompact(v)} width={40} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Tooltip formatter={(value) => [fmtCompact(value), 'Cumulative']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f1f5f9' }} />
              <Line type="monotone" dataKey="cumActual" stroke="url(#cumGrad)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="cumProjected" stroke="url(#cumGrad)" strokeWidth={2.5} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  const CategoryBreakdown = () => {
    const [breakdownType, setBreakdownType] = useState('expense')
    const periodTxns = useMemo(() => txns.filter(t => t.date && t.date.startsWith(statPeriod)), [txns, statPeriod])
    const aInc = useMemo(() => periodTxns.filter(isIncomeType).reduce((s,t)=>s+incomeAmt(t),0), [periodTxns])
    const aExp = useMemo(() => periodTxns.filter(t => ['expense','cos','opps'].includes(t.type)).reduce((s,t)=>s+Number(t.amount||0),0), [periodTxns])
    const catTotals = useMemo(() => {
      const t = {}
      periodTxns.forEach(txn => { if (breakdownType === 'income' ? isIncomeType(txn) : ['expense','cos','opps'].includes(txn.type)) { const c = txn.category || 'Uncategorized'; t[c] = (t[c] || 0) + (isIncomeType(txn) ? incomeAmt(txn) : Number(txn.amount || 0)) } })
      return Object.entries(t).map(([name, total]) => ({ name, total })).sort((a,b) => b.total - a.total)
    }, [periodTxns, breakdownType])
    const tAmt = catTotals.reduce((s,c) => s+c.total, 0), colors = ['#FF6B6B', '#FF9E7D', '#FFD93D', '#A8E6CF', '#56C596', '#4D96FF', '#6BCBFF', '#9B72AA', '#E06C9F', '#F8BD7F'], r = 60, cX = 160, cY = 160, fW = 320, fH = 320
    let cumA = -Math.PI / 2
    let segs = catTotals.map((c, i) => {
      const pct = tAmt > 0 ? c.total / tAmt : 0, ang = pct * 2 * Math.PI, mid = cumA + ang/2, x1 = cX + r*Math.cos(cumA), y1 = cY + r*Math.sin(cumA)
      cumA += ang; const x2 = cX + r*Math.cos(cumA), y2 = cY + r*Math.sin(cumA), lx = cX + (r+35)*Math.cos(mid), ly = cY + (r+35)*Math.sin(mid)
      return { ...c, percentage: (pct*100).toFixed(1), pathData: pct === 1 ? `M ${cX} ${cY-r} A ${r} ${r} 0 1 1 ${cX-0.01} ${cY-r} Z` : `M ${cX} ${cY} L ${x1} ${y1} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`, color: colors[i % colors.length], label: { x: lx, y: ly, sx: cX + (r+2)*Math.cos(mid), sy: cY + (r+2)*Math.sin(mid), ex: cX + (r+20)*Math.cos(mid), ey: cY + (r+20)*Math.sin(mid), anchor: Math.cos(mid) > 0 ? 'start' : 'end' } }
    })
    const left = segs.filter(s => s.label.anchor === 'end').sort((a,b) => a.label.y - b.label.y), right = segs.filter(s => s.label.anchor === 'start').sort((a,b) => a.label.y - b.label.y)
    const deconf = (arr) => { for (let i=1; i<arr.length; i++) if (arr[i].label.y < arr[i-1].label.y + 18) arr[i].label.y = arr[i-1].label.y + 18; for (let i=arr.length-2; i>=0; i--) if (arr[i].label.y > arr[i+1].label.y - 18) arr[i].label.y = arr[i+1].label.y - 18; arr.forEach(s => s.label.ey = s.label.y) }
    deconf(left); deconf(right)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, paddingBottom: 40 }}>
        <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
           <button onClick={() => setBreakdownType('income')} style={{ flex: 1, padding: 15, background: 'transparent', border: 'none', borderBottom: breakdownType === 'income' ? '3px solid #3b82f6' : '3px solid transparent', fontWeight: 700, color: '#3b82f6', opacity: breakdownType === 'income' ? 1 : 0.5 }}>Income {fmtCompact(aInc)}</button>
           <button onClick={() => setBreakdownType('expense')} style={{ flex: 1, padding: 15, background: 'transparent', border: 'none', borderBottom: breakdownType === 'expense' ? '4px solid #ef4444' : '4px solid transparent', fontWeight: 700, color: '#ef4444', opacity: breakdownType === 'expense' ? 1 : 0.5 }}>Exp. {fmtCompact(aExp)}</button>
        </div>
        <div className="card" style={{ padding: '20px 10px', display: 'flex', justifyContent: 'center' }}>
          {segs.length > 0 ? <svg viewBox={`0 0 ${fW} ${fH}`} style={{ width: '100%', height: 320, overflow: 'visible' }}>{segs.map((s, i) => (<g key={i}><path d={s.pathData} fill={s.color} stroke="#fff" /><text x={s.label.x + (s.label.anchor === 'start' ? 5 : -5)} y={s.label.y} textAnchor={s.label.anchor} style={{ fontSize: 9, fontWeight: 700, fill: '#1e293b' }}>{s.name} {s.percentage}%</text><path d={`M ${s.label.sx} ${s.label.sy} Q ${s.label.ex} ${s.label.ey} ${s.label.x} ${s.label.y}`} fill="none" stroke={s.color} strokeWidth="0.8" opacity="0.4" /></g>))}</svg> : <div style={{ padding: 40 }}>No data for period</div>}
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>{segs.map((s, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i === segs.length-1 ? 'none' : '1px solid #f1f5f9' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ background: s.color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6 }}>{Math.round(s.percentage)}%</div><div style={{ fontWeight: 600 }}>{s.name}</div></div><div style={{ fontWeight: 700 }}>{fmtTZS(s.total)}</div></div>))}</div>
      </div>
    )
  }

  const RecordsView = () => {
    const grouped = useMemo(() => {
      const g = new Map()
      const sorted = [...insightFilteredTxns].sort((a,b) => b.date.localeCompare(a.date))
      sorted.forEach(t => {
        const d = new Date(t.date), mon = d.toLocaleString('default', { month: 'long', year: 'numeric' })
        if (!g.has(mon)) g.set(mon, { items: [], totalOut: 0, totalIn: 0 })
        const e = g.get(mon)
        e.items.push(t); if (t.direction === 'out') e.totalOut += t.amount; else e.totalIn += t.amount
      })
      return Array.from(g.entries())
    }, [insightFilteredTxns])

    return (
      <div style={{ padding: '0 12px 100px' }}>
        <div className="modeSegmented" style={{ 
          display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12, 
          marginBottom: 16, marginTop: 12 
        }}>
          <button 
            onClick={() => setTxnsMainTab('activity')} 
            style={{ 
              flex: 1, padding: '10px 8px', borderRadius: 10, 
              background: txnsMainTab === 'activity' ? '#fff' : 'transparent', 
              border: 'none', fontWeight: 700, fontSize: 13, 
              color: txnsMainTab === 'activity' ? '#5a5fb0' : '#64748b', boxDecorationBreak: 'clone',
              boxShadow: txnsMainTab === 'activity' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' 
            }}
          >Activity</button>
          <button 
            onClick={() => setTxnsMainTab('future')} 
            style={{ 
              flex: 1, padding: '10px 8px', borderRadius: 10, 
              background: txnsMainTab === 'future' ? '#fff' : 'transparent', 
              border: 'none', fontWeight: 700, fontSize: 13, 
              color: txnsMainTab === 'future' ? '#5a5fb0' : '#64748b',
              boxShadow: txnsMainTab === 'future' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' 
            }}
          >Future</button>
        </div>

        {grouped.map(([month, data]) => (
          <div key={month} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16, borderRadius: 18 }}>
            {/* Group Header */}
            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
              padding: '10px 16px', borderBottom: '1px solid #f8fafc', background: '#fcfdfe'
            }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1e293b' }}>{month}</div>
              <div style={{ fontWeight: 700, fontSize: 9.5, letterSpacing: '0.01em', color: data.totalOut > 0 ? '#ef4444' : '#10b981' }}>
                {data.totalOut > 0 ? `OUT ${fmtCompact(data.totalOut)}` : `IN ${fmtCompact(data.totalIn)}`}
              </div>
            </div>

            {/* List Items */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data.items.map((t, i) => (
                <div key={t.id} onClick={() => setSelectedTxn(t)} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', borderBottom: i === data.items.length - 1 ? 'none' : '1px solid #f8fafc',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {/* Circle Icon */}
                    <div style={{ 
                      width: 36, height: 36, borderRadius: 18, 
                      background: '#fff', border: '1px solid #f1f5f9', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      fontWeight: 700, fontSize: 13, color: '#64748b'
                    }}>
                      {t.title.slice(0,1).toUpperCase()}
                    </div>
                    {/* Labels */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1e293b' }}>{t.title}</div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1 }}>
                        {new Date(t.date).getDate()} {new Date(t.date).toLocaleString('default',{month:'short'})} 
                        {t.raw?.recurring && ` • (${t.raw.recurring.current} of ${t.raw.recurring.total})`}
                        {!t.raw?.recurring && t.sub && ` • ${t.sub}`}
                      </div>
                      {t.raw?.reimbursedBy && t.raw.reimbursedBy.length > 0 && (
                        <div className="reimbursedBadge" style={{ fontSize: 9, marginTop: 4 }}>
                          ✓ {fmtCompact(t.raw.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))} Reimbursed
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Amount */}
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: t.direction === 'in' ? '#10b981' : '#ef4444' }}>
                    {t.direction === 'in' ? '' : '-'}{fmtCompact(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            No {txnsMainTab} transactions found for this period.
          </div>
        )}
      </div>
    )
  }

  const KIND_STYLE = {
    income: { bg: '#ecfdf5', fg: '#059669', label: 'IN', amtColor: '#10b981', sign: '+' },
    expense: { bg: '#fef2f2', fg: '#dc2626', label: 'OUT', amtColor: '#ef4444', sign: '-' },
    allocation: { bg: '#eef2ff', fg: '#4f46e5', label: 'ALC', amtColor: '#6366f1', sign: '-' },
    growth: { bg: '#ecfdf5', fg: '#15803d', label: 'GRW', amtColor: '#2bb06a', sign: '-' },
  }

  const BreakdownModal = ({ month, type, category, title }) => {
    const list = useMemo(() => {
      const mKey = month // e.g. "2026-02"
      const vaultTxns = txns.filter(t => {
        if (!t.date || !t.date.startsWith(mKey)) return false
        if (type === 'income') return isIncomeType(t)
        if (type === 'expense') return ['expense', 'cos', 'opps'].includes(t.type)
        if (type === 'allocation') {
          if (t.type !== 'allocation') return false
          if (!category) return true
          if (category === ALLOC_OTHER_KEY) return !allocCategoryOrder.includes(t.category)
          return t.category === category
        }
        if (type === 'all') return ['income', 'collection', 'expense', 'cos', 'opps', 'allocation', 'growth'].includes(t.type)
        return false
      })
      // Category-filtered allocation drill-downs only cover categorized ledger
      // transactions — account-level transfers carry no category to match against.
      const acctTxns = category ? [] : accountTxns.filter(t => {
        if (t.kind === 'txn') return false
        if (!t.date || !t.date.startsWith(mKey)) return false
        if (type === 'all') return true
        const dirMatch = (type === 'income') ? t.direction === 'in' : t.direction === 'out'
        return dirMatch
      })
      return [...vaultTxns.map(t => ({ ...t, source: 'ledger' })), ...acctTxns.map(t => ({ ...t, source: 'account' }))]
        .sort((a,b) => b.date.localeCompare(a.date))
    }, [month, type, category])

    const rowKind = (t) => {
      if (t.source === 'account') return t.direction === 'in' ? 'income' : 'expense'
      if (isIncomeType(t)) return 'income'
      if (t.type === 'allocation') return 'allocation'
      if (t.type === 'growth') return 'growth'
      return 'expense'
    }

    return (
      <div className="modalBackdrop" onClick={() => setBreakdownModal(null)} style={{ zIndex: 200 }}>
        <div className="modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth: 450, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{month} • {monthlyViewMode === 'actual' ? 'Actuals' : 'Projected'}</div>
            </div>
            <button className="btn" onClick={() => setBreakdownModal(null)}>Close</button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '10px 0' }}>
            {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No transactions found</div>}
            {list.map((t, i) => {
              const kind = rowKind(t), st = KIND_STYLE[kind]
              return (
                <div
                  key={i}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i === list.length-1 ? 'none' : '1px solid #f8fafc', cursor: 'pointer' }}
                  onClick={() => { if (t.source === 'ledger') setSelectedTxn({ raw: t }); setBreakdownModal(null); }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: st.bg, color: st.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                      {st.label}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.category || t.note || (kind === 'income' ? 'Income' : kind === 'allocation' ? 'Lifestyle' : 'Expense')}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} {t.note && `• ${t.note}`}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: st.amtColor }}>
                    {st.sign}{fmtCompact(t.amount)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (selectedTxn) {
    return <TransactionDetail
      txn={selectedTxn.raw}
      onClose={() => setSelectedTxn(null)}
      onSave={updateTxn}
      onDelete={delTxn}
      accounts={accounts}
      expenseCats={expenseCats}
      incomeCats={incomeCats}
      clients={clients}
      settings={settings}
      show={show}
      onReimburse={selectedTxn.type === 'expense' ? () => {
        handleOpenReimburse(selectedTxn.raw)
        setSelectedTxn(null)
      } : null}
    />
  }

  return (
    <div className="txScreen" style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ padding: '20px 15px', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', alignItems: 'center', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
          {/* Left: Ledger Picker */}
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              className="ledgerGhost"
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowLedgerPicker(true); }}
              style={{ padding: 0, margin: 0, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9 }}
            >
              {activeLedger?.name || 'Personal'} <span style={{ fontSize: '0.8em' }}>▾</span>
            </button>
          </div>

          {/* Center: Period Navigator */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, position: 'relative' }}>
            <button className="ledgerNavBtn" onClick={() => shiftPeriod(-1)}>‹</button>
            <div 
              style={{ fontWeight: 700, fontSize: 16, minWidth: 80, textAlign: 'center', cursor: 'pointer' }}
              onClick={() => setShowGranularityMenu(!showGranularityMenu)}
            >
              {viewGranularity === 'year' && statYear}
              {viewGranularity === 'month' && new Date(statPeriod + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
              {viewGranularity === 'week' && `Week of ${new Date(statPeriod).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`}
            </div>
            <button className="ledgerNavBtn" onClick={() => shiftPeriod(1)}>›</button>

            {showGranularityMenu && (
              <>
                <div 
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} 
                  onClick={() => setShowGranularityMenu(false)}
                />
                <div style={{ 
                  position: 'absolute', top: 35, left: '50%', transform: 'translateX(-50%)', 
                  background: '#fff', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                  padding: 8, zIndex: 101, minWidth: 120, border: '1px solid #f1f5f9' 
                }}>
                  {['Year', 'Month', 'Week'].map(g => (
                    <button
                      key={g}
                      onClick={() => {
                        const low = g.toLowerCase()
                        setViewGranularity(low)
                        setShowGranularityMenu(false)
                        // Adjust statPeriod to current date for that granularity
                        const now = new Date()
                        if (low === 'year') setStatPeriod(String(now.getFullYear()))
                        else if (low === 'month') setStatPeriod(now.toISOString().slice(0,7))
                        else setStatPeriod(now.toISOString().slice(0,10))
                      }}
                      style={{ 
                        display: 'block', width: '100%', padding: '10px 12px', border: 'none', 
                        background: viewGranularity === g.toLowerCase() ? '#eff6ff' : 'transparent', 
                        borderRadius: 8, textAlign: 'left', fontWeight: 600, fontSize: 13,
                        color: viewGranularity === g.toLowerCase() ? '#3b82f6' : '#64748b'
                      }}
                    >
                      {g}ly
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right: Empty for balance */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          </div>
      </div>
      <div style={{ padding: '15px 15px 0 15px' }}>
        <div style={{ display: 'flex', background: '#fff', borderRadius: 12, padding: 4, border: '1px solid #e2e8f0' }}>{['Summary', 'Cashflow', 'Records'].map(t => (<button key={t} onClick={() => setInsightTab(t.toLowerCase())} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: insightTab === t.toLowerCase() ? '#eff6ff' : 'transparent', border: 'none', color: insightTab === t.toLowerCase() ? '#3b82f6' : '#64748b', fontWeight: 700 }}>{t}</button>))}</div>
      </div>
      {insightTab === 'records' && <RecordsView />}
      {insightTab === 'cashflow' && (
        <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 15 }}>
          {viewGranularity === 'year' && <BreakevenChart />}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Monthly Performance Breakdown</div><div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 18 }}><button onClick={()=>setMonthlyViewMode('actual')} style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: monthlyViewMode === 'actual' ? '#6366f1' : 'transparent', color: monthlyViewMode === 'actual' ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12 }}>Actual</button><button onClick={()=>setMonthlyViewMode('projected')} style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: monthlyViewMode === 'projected' ? '#6366f1' : 'transparent', color: monthlyViewMode === 'projected' ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12 }}>Projected</button></div></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Month</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Income</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Expenses</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Lifestyle</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyStats].reverse().map(m => {
                    const inc = monthlyViewMode === 'actual' ? m.actualInc : m.inc;
                    const exp = monthlyViewMode === 'actual' ? m.actualExp : m.exp;
                    const all = monthlyViewMode === 'actual' ? m.actualAll : m.all;
                    const growth = monthlyViewMode === 'actual' ? m.actualGrowth : m.growth;
                    if (inc === 0 && exp === 0 && all === 0 && growth === 0) return null;
                    return (
                      <tr key={m.key} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 0', fontWeight: 700 }}>{m.label}</td>
                        <td 
                          style={{ textAlign: 'right', color: '#22c55e', cursor: 'pointer' }} 
                          onClick={() => setBreakdownModal({ month: m.key, type: 'income', title: `${m.label} Income` })}
                        >
                          {fmtCompact(inc)}
                        </td>
                        <td 
                          style={{ textAlign: 'right', color: '#ef4444', cursor: 'pointer' }}
                          onClick={() => setBreakdownModal({ month: m.key, type: 'expense', title: `${m.label} Expense` })}
                        >
                          {fmtCompact(exp)}
                        </td>
                        <td 
                          style={{ textAlign: 'right', color: '#6366f1', cursor: 'pointer' }}
                          onClick={() => setBreakdownModal({ month: m.key, type: 'allocation', title: `${m.label} Lifestyle` })}
                        >
                          {fmtCompact(all)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmtCompact(inc - exp - all - growth)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {insightTab === 'summary' && <div style={{ padding: 15 }}><CategoryBreakdown /></div>}
      {breakdownModal && <BreakdownModal {...breakdownModal} />}

      {showReimburseModal && reimburseTxn && (
        <div className="modalBackdrop" onClick={() => setShowReimburseModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Reimburse</div>
            <div className="reimburseOriginal">
              <div className="reimburseOriginalLabel">Original Expense</div>
              <div className="reimburseOriginalInfo">
                <span>{reimburseTxn.note || reimburseTxn.category || 'Expense'}</span>
                <span className="reimburseOriginalAmt">{fmtTZS(reimburseTxn.amount)}</span>
              </div>
              {reimburseTxn.reimbursedBy && reimburseTxn.reimbursedBy.length > 0 && (
                <div className="reimburseAlready" style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Already reimbursed: {fmtTZS(reimburseTxn.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))}
                </div>
              )}
            </div>
            <div className="accQuickForm" style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                  Reimbursement Amount (TZS) — Max: {fmtTZS(Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0))}
                </label>
                <input
                  inputMode="decimal"
                  value={reimburseAmount}
                  onChange={e => {
                    const max = Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                    const val = Number(e.target.value.replace(/,/g, '') || 0)
                    if (val > max) setReimburseAmount(String(max))
                    else setReimburseAmount(e.target.value)
                  }}
                  className="input"
                  placeholder="e.g. 10000"
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Date</label>
                <input
                  type="date"
                  className="input"
                  value={reimburseDate}
                  onChange={e => setReimburseDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: reimburseError ? '#ef4444' : '#64748b' }}>
                  Receive Into Account {reimburseError ? '— Required' : ''}
                </label>
                <select
                  className="input"
                  value={reimburseAccountId}
                  onChange={e => { setReimburseAccountId(e.target.value); setReimburseError(false) }}
                  style={{ 
                    ...(reimburseError ? { borderColor: '#ef4444' } : {}),
                    appearance: 'auto',
                    paddingRight: '30px'
                  }}
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const ra = accounts.find(a => a.id === reimburseAccountId)
                if (ra && Array.isArray(ra.subAccounts) && ra.subAccounts.length > 0) {
                  return (
                    <div className="field">
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Sub-account</label>
                      <select className="input" value={reimburseSubAccountId} onChange={e => setReimburseSubAccountId(e.target.value)}>
                        <option value="">Select sub-account</option>
                        {ra.subAccounts.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                }
                return null
              })()}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="pillBtn" type="button" onClick={() => setShowReimburseModal(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button
                  className="pillBtn primary"
                  type="button"
                  onClick={() => {
                    if (!reimburseAccountId) {
                      setReimburseError(true)
                      return
                    }
                    addReimbursement({
                      originalTxnId: reimburseTxn.id,
                      amount: reimburseAmount.replace(/,/g, ''),
                      accountId: reimburseAccountId,
                      subAccountId: reimburseSubAccountId,
                      date: reimburseDate
                    })
                    setReimburseError(false)
                    setShowReimburseModal(false)
                    setReimburseTxn(null)
                  }}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Save Reimbursement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
