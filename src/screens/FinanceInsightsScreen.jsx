import React, { useState, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, fmtCompact, todayISO, calculateAssetMetrics, monthsBetween, daysBetween } from '../money'
import { TransactionDetail } from '../components/TransactionDetail'

export function FinanceInsightsScreen() {
  const { 
    activeLedger, accounts, accountTxns, txns, clients,
    expenseCats, incomeCats, settings, show, updateTxn, delTxn,
    activeLedgerId, ALL_LEDGERS_ID, setShowLedgerPicker
  } = useAppContext()

  const [txnsMainTab, setTxnsMainTab] = useState('activity') 
  const [viewGranularity, setViewGranularity] = useState('year') 
  const [statPeriod, setStatPeriod] = useState(() => new Date().toISOString().slice(0, 4))
  const [insightTab, setInsightTab] = useState('cashflow')
  const [monthlyViewMode, setMonthlyViewMode] = useState('actual')
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [showGranularityMenu, setShowGranularityMenu] = useState(false)
  const [breakdownModal, setBreakdownModal] = useState(null) // { month, type, title }

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
    recentTxns.forEach(t => { if (t.type === 'income') inc3m += Number(t.amount || 0); else if (t.type === 'expense' || t.type === 'cos' || t.type === 'opps') exp3m += Number(t.amount || 0); });
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
      return { id: `txn-${t.id}`, date: t.date, title: t.category || (t.type === 'income' ? 'Income' : 'Expense'), sub, amount: Number(t.amount || 0), direction: t.type === 'income' ? 'in' : 'out', type: t.type, raw: t }
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
    txns.forEach(t => {
      const date = t.date || todayISO()
      if (viewGranularity === 'month' && !date.startsWith(statPeriod)) return
      if (viewGranularity === 'year' && Number(date.slice(0, 4)) !== statYear) return
      const key = viewGranularity === 'year' ? date.slice(0, 7) : date
      if (!stats.has(key)) stats.set(key, { inc: 0, exp: 0, actualInc: 0, actualExp: 0, all: 0, actualAll: 0 })
      const e = stats.get(key), amt = Number(t.amount || 0), act = date <= todayISO()
      if (t.type === 'income') { e.inc += amt; if (act) e.actualInc += amt }
      else if (['expense', 'cos', 'opps'].includes(t.type)) { e.exp += amt; if (act) e.actualExp += amt }
      else if (t.type === 'allocation') { e.all += amt; if (act) e.actualAll += amt }
    })
    const res = []
    if (viewGranularity === 'year') {
      for (let m = 1; m <= 12; m++) {
        const k = `${statYear}-${String(m).padStart(2, '0')}`, dt = new Date(statYear, m - 1, 1), d = stats.get(k) || { inc: 0, exp: 0, actualInc: 0, actualExp: 0, all: 0, actualAll: 0 }
        res.push({ key: k, label: dt.toLocaleString('default', { month: 'short' }), ...d })
      }
    }
    return res
  }, [statYear, viewGranularity, txns, statPeriod])

  const CashflowChart = () => {
    const data = [...monthlyStats].reverse()
    const maxVal = Math.max(...data.map(m => Math.max(m.inc, m.exp, m.all || 0)), 1)
    const isYear = viewGranularity === 'year', w = 300, h = 130, pL = 10, pR = 10, pT = 15, pB = 25
    const getNiceMax = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))), f = m/p; let nf; if (f<=1) nf=1; else if (f<=2) nf=2; else if (f<=2.5) nf=2.5; else if (f<=5) nf=5; else nf=10; return nf*p; }
    const chartMax = getNiceMax(maxVal)
    const getX = (i) => (i * (w - pL - pR)) / Math.max(data.length - 1, 1) + pL
    const getY = (v) => h - (v / chartMax) * (h - pT - pB) - pB
    const now = new Date(), todayStr = now.toISOString().slice(0,10)
    let activeIdx = -1
    if (viewGranularity === 'month') { if (statPeriod === todayStr.slice(0,7)) activeIdx = now.getDate()-1; else if (statPeriod < todayStr.slice(0,7)) activeIdx = data.length-1 }
    else if (viewGranularity === 'year') { if (statYear === now.getFullYear()) activeIdx = now.getMonth(); else if (statYear < now.getFullYear()) activeIdx = 11 }
    
    const incAct = data.slice(0, activeIdx+1).map((m,i)=>`${i===0?'M':'L'} ${getX(i)} ${getY(m.inc)}`).join(' ')
    const expAct = data.slice(0, activeIdx+1).map((m,i)=>`${i===0?'M':'L'} ${getX(i)} ${getY(m.exp)}`).join(' ')
    const startIdx = Math.max(0, activeIdx)
    const incProj = data.slice(startIdx).map((m,i)=>`${i===0?'M':'L'} ${getX(i+startIdx)} ${getY(m.inc)}`).join(' ')
    const expProj = data.slice(startIdx).map((m,i)=>`${i===0?'M':'L'} ${getX(i+startIdx)} ${getY(m.exp)}`).join(' ')
    const tInc = data.reduce((s,m)=>s+m.inc,0), tExp = data.reduce((s,m)=>s+m.exp,0), aInc = data.reduce((s,m)=>s+m.actualInc,0), pInc = Math.max(0,tInc-aInc), aExp = data.reduce((s,m)=>s+m.actualExp,0), pExp = Math.max(0,tExp-aExp), aBal = aInc-aExp, pBal = pInc-pExp, tBal = tInc-tExp
    return (
      <div className="card" style={{ padding: '20px 16px', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}><div style={{ fontWeight: 700, fontSize: 18 }}>Money Cashflow</div><div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: '4px 8px', borderRadius: 8 }}>{statYear}</div></div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 25, fontSize: 11, color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 24, height: 2, background: '#64748b' }} /> Actual</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 24, display: 'flex', gap: 2 }}>{[1,2,3,4].map(k=><div key={k} style={{ width: 4, height: 2, background: '#64748b' }} />)}</div> Projected</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 25, justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#64748b' }}>Actual Income</div><div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{fmtCompact(aInc)}</div><div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Proj: <span style={{ color: '#22c55e' }}>{fmtCompact(pInc)}</span><br/>Total: <span style={{ color: '#22c55e' }}>{fmtCompact(tInc)}</span></div></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#64748b' }}>Actual Exp.</div><div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{fmtCompact(aExp)}</div><div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Proj: <span style={{ color: '#ef4444' }}>{fmtCompact(pExp)}</span><br/>Total: <span style={{ color: '#ef4444' }}>{fmtCompact(tExp)}</span></div></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: '#64748b' }}>Actual Bal.</div><div style={{ fontSize: 20, fontWeight: 700, color: aBal>=0?'#16A34A':'#ef4444' }}>{fmtCompact(aBal)}</div><div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Proj: <span style={{ color: pBal>=0?'#16A34A':'#ef4444' }}>{fmtCompact(pBal)}</span><br/>Total: <span style={{ color: tBal>=0?'#16A34A':'#ef4444' }}>{fmtCompact(tBal)}</span></div></div>
        </div>
        <div style={{ position: 'relative', height: h, width: 'calc(100% + 16px)', marginLeft: -7, marginBottom: 10 }}>
          <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(p=>(<g key={p}><line x1={pL} y1={getY(chartMax*p)} x2={w-pR} y2={getY(chartMax*p)} stroke="#f1f5f9" strokeDasharray="4 4" strokeWidth="0.5" /><text x={pL-4} y={getY(chartMax*p)} textAnchor="end" alignmentBaseline="middle" fill="#94a3b8" style={{ fontSize: 8 }}>{(chartMax*p/1_000_000).toFixed(1)}M</text></g>))}
            {data.map((m, i) => (isYear || i % 5 === 0) && <text key={m.key} x={getX(i)} y={h-5} textAnchor="middle" fill="#94a3b8" style={{ fontSize: 8 }}>{isYear ? m.label.slice(0,3) : m.label}</text>)}
            {activeIdx>=0 && <>
              <path d={expAct} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.6" />
              <path d={incAct} fill="none" stroke="#22c55e" strokeWidth="2" />
            </>}
            {activeIdx < data.length-1 && <>
              <path d={expProj} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 4" opacity="0.4" />
              <path d={incProj} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
            </>}
            {data.map((m,i)=>(<React.Fragment key={i}><circle cx={getX(i)} cy={getY(m.exp)} r="1.5" fill={i<=activeIdx?"#ef4444":"#fff"} stroke="#ef4444" strokeWidth={i<=activeIdx?"0":"1"} opacity={i<=activeIdx?"0.6":"0.4"} /><circle cx={getX(i)} cy={getY(m.inc)} r="1.5" fill={i<=activeIdx?"#22c55e":"#fff"} stroke="#22c55e" strokeWidth={i<=activeIdx?"0":"1"} opacity={i<=activeIdx?"1":"0.6"} /></React.Fragment>))}
          </svg>
        </div>
      </div>
    )
  }

  const CategoryBreakdown = () => {
    const [breakdownType, setBreakdownType] = useState('expense')
    const periodTxns = useMemo(() => txns.filter(t => t.date && t.date.startsWith(statPeriod)), [txns, statPeriod])
    const aInc = useMemo(() => periodTxns.filter(t => t.type === 'income').reduce((s,t)=>s+Number(t.amount||0),0), [periodTxns])
    const aExp = useMemo(() => periodTxns.filter(t => ['expense','cos','opps'].includes(t.type)).reduce((s,t)=>s+Number(t.amount||0),0), [periodTxns])
    const catTotals = useMemo(() => {
      const t = {}
      periodTxns.forEach(txn => { if (breakdownType === 'income' ? txn.type === 'income' : ['expense','cos','opps'].includes(txn.type)) { const c = txn.category || 'Uncategorized'; t[c] = (t[c] || 0) + Number(txn.amount || 0) } })
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
      <div style={{ padding: '0 10px 30px 10px' }}>
        <div className="modeSegmented" style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12, marginBottom: 15, marginTop: 10 }}>
          <button onClick={() => setTxnsMainTab('activity')} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: txnsMainTab === 'activity' ? '#fff' : 'transparent', border: 'none', fontWeight: 700, fontSize: 13, color: txnsMainTab === 'activity' ? '#5a5fb0' : '#64748b', boxShadow: txnsMainTab === 'activity' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>Activity</button>
          <button onClick={() => setTxnsMainTab('future')} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: txnsMainTab === 'future' ? '#fff' : 'transparent', border: 'none', fontWeight: 700, fontSize: 13, color: txnsMainTab === 'future' ? '#5a5fb0' : '#64748b', boxShadow: txnsMainTab === 'future' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>Future</button>
        </div>
        {grouped.map(([month, data]) => (
          <div key={month} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}><div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{month}</div><div style={{ fontWeight: 800, fontSize: 11, color: data.totalOut > 0 ? '#ef4444' : '#22c55e' }}>{data.totalOut > 0 ? `OUT ${fmtCompact(data.totalOut)}` : `IN ${fmtCompact(data.totalIn)}`}</div></div>
            {data.items.map((t, i) => (
              <div key={t.id} onClick={() => setSelectedTxn(t)} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderBottom: i === data.items.length - 1 ? 'none' : '1px solid #f8fafc' }}>
                 <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div style={{ width: 44, height: 44, borderRadius: 22, background: '#fff', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 15 }}>{t.title.slice(0,1).toUpperCase()}</div><div><div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{t.title}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(t.date).getDate()} {new Date(t.date).toLocaleString('default',{month:'short'})} {t.raw?.recurring && `• (${t.raw.recurring.current} of ${t.raw.recurring.total})`}{!t.raw?.recurring && t.sub && `• ${t.sub}`}</div></div></div>
                 <div style={{ fontWeight: 800, fontSize: 15, color: t.direction === 'in' ? '#22c55e' : '#ef4444' }}>{t.direction === 'in' ? '' : '-'}{fmtCompact(t.amount)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const BreakdownModal = ({ month, type, title }) => {
    const list = useMemo(() => {
      const mKey = month // e.g. "2026-02"
      const vaultTxns = txns.filter(t => {
        if (!t.date || !t.date.startsWith(mKey)) return false
        if (type === 'income') return t.type === 'income'
        if (type === 'expense') return ['expense', 'cos', 'opps'].includes(t.type)
        if (type === 'allocation') return t.type === 'allocation'
        return false
      })
      const acctTxns = accountTxns.filter(t => {
        if (t.kind === 'txn') return false
        if (!t.date || !t.date.startsWith(mKey)) return false
        const dirMatch = (type === 'income') ? t.direction === 'in' : t.direction === 'out'
        return dirMatch
      })
      return [...vaultTxns.map(t => ({ ...t, source: 'ledger' })), ...acctTxns.map(t => ({ ...t, source: 'account' }))]
        .sort((a,b) => b.date.localeCompare(a.date))
    }, [month, type])

    return (
      <div className="modalBackdrop" onClick={() => setBreakdownModal(null)} style={{ zIndex: 200 }}>
        <div className="modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth: 450, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{title} Breakdown</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{month} • {monthlyViewMode === 'actual' ? 'Actuals' : 'Projected'}</div>
            </div>
            <button className="btn" onClick={() => setBreakdownModal(null)}>Close</button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '10px 0' }}>
            {list.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No transactions found</div>}
            {list.map((t, i) => (
              <div 
                key={i} 
                style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i === list.length-1 ? 'none' : '1px solid #f8fafc', cursor: 'pointer' }}
                onClick={() => { if (t.source === 'ledger') setSelectedTxn({ raw: t }); setBreakdownModal(null); }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: type === 'income' ? '#ecfdf5' : '#fef2f2', color: type === 'income' ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
                    {type === 'income' ? 'IN' : 'OUT'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.category || t.note || (type === 'income' ? 'Income' : 'Expense')}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} {t.note && `• ${t.note}`}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: type === 'income' ? '#10b981' : '#ef4444' }}>
                  {type === 'income' ? '+' : '-'}{fmtCompact(t.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (selectedTxn) {
    return <TransactionDetail txn={selectedTxn.raw} onClose={() => setSelectedTxn(null)} onSave={updateTxn} onDelete={delTxn} accounts={accounts} expenseCats={expenseCats} incomeCats={incomeCats} clients={clients} />
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
        <div style={{ display: 'flex', background: '#fff', borderRadius: 12, padding: 4, border: '1px solid #e2e8f0' }}>{['Records', 'Cashflow', 'Summary'].map(t => (<button key={t} onClick={() => setInsightTab(t.toLowerCase())} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: insightTab === t.toLowerCase() ? '#eff6ff' : 'transparent', border: 'none', color: insightTab === t.toLowerCase() ? '#3b82f6' : '#64748b', fontWeight: 700 }}>{t}</button>))}</div>
      </div>
      {insightTab === 'records' && <RecordsView />}
      {insightTab === 'cashflow' && (
        <div style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <CashflowChart />
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}><div style={{ fontWeight: 700, fontSize: 14 }}>Monthly Performance Breakdown</div><div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 18 }}><button onClick={()=>setMonthlyViewMode('actual')} style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: monthlyViewMode === 'actual' ? '#6366f1' : 'transparent', color: monthlyViewMode === 'actual' ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12 }}>Actual</button><button onClick={()=>setMonthlyViewMode('projected')} style={{ padding: '5px 12px', borderRadius: 15, border: 'none', background: monthlyViewMode === 'projected' ? '#6366f1' : 'transparent', color: monthlyViewMode === 'projected' ? '#fff' : '#64748b', fontWeight: 700, fontSize: 12 }}>Projected</button></div></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Month</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Income</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Expenses</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Allocations</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyStats].reverse().map(m => {
                    const inc = monthlyViewMode === 'actual' ? m.actualInc : m.inc;
                    const exp = monthlyViewMode === 'actual' ? m.actualExp : m.exp;
                    const all = monthlyViewMode === 'actual' ? m.actualAll : m.all;
                    if (inc === 0 && exp === 0 && all === 0) return null;
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
                          onClick={() => setBreakdownModal({ month: m.key, type: 'allocation', title: `${m.label} Allocation` })}
                        >
                          {fmtCompact(all)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmtCompact(inc - exp - all)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {(() => {
             const tc = totals.landCapital + totals.sharesCapital + totals.liquidCash + totals.loanBook, i = tc > 0 ? (totals.landCapital/tc)*100 : 0, g = tc > 0 ? (totals.sharesCapital/tc)*100 : 0, d = tc > 0 ? (totals.liquidCash/tc)*100 : 0, r = tc > 0 ? (totals.loanBook/tc)*100 : 0
             return (<><div className="card" style={{ padding: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}><div style={{ fontSize: 18, fontWeight: 700 }}>Capital Allocation</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtTZS(totals.invested)}</div></div><div style={{ height: 16, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 20 }}><div style={{ width: `${i}%`, background: '#22c55e' }} /><div style={{ width: `${g}%`, background: '#6366f1' }} /><div style={{ width: `${d}%`, background: '#f59e0b' }} /><div style={{ width: `${r}%`, background: '#ef4444' }} /></div><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 5, background: '#22c55e' }} /> Illiquid Assets {i.toFixed(0)}%</div><div style={{ fontWeight: 700 }}>{fmtTZS(totals.landCapital)}</div></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 5, background: '#6366f1' }} /> High-Growth {g.toFixed(0)}%</div><div style={{ fontWeight: 700 }}>{fmtTZS(totals.sharesCapital)}</div></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 5, background: '#f59e0b' }} /> Idle Asset {d.toFixed(0)}%</div><div style={{ fontWeight: 700 }}>{fmtTZS(totals.liquidCash)}</div></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#ef4444' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 5, background: '#ef4444' }} /> At-Risk {r.toFixed(0)}%</div><div style={{ fontWeight: 700 }}>{fmtTZS(totals.loanBook)}</div></div></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}><div className="card" style={{ padding: 15 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10 }}>Source of Capital</div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}><span>Self Funded</span> <b>{totals.assets > 0 ? ((totals.netWorth / totals.assets)*100).toFixed(0) : 0}%</b></div><div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${totals.assets > 0 ? (totals.netWorth/totals.assets)*100 : 0}%`, height: '100%', background: '#22c55e' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}><span>Credit</span> <b>{totals.assets > 0 ? ((totals.liabilities / totals.assets)*100).toFixed(0) : 0}%</b></div></div><div className="card" style={{ padding: 15 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10 }}>Capital Efficiency</div><div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{totals.monthlyReturn.toFixed(1)}% <span style={{ fontSize: 14 }}>↑</span></div><div style={{ fontSize: 10, color: '#64748b' }}>Return on Capital</div></div></div><div className="card" style={{ padding: 15 }}><div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 5 }}>Capital Coverage</div><div style={{ fontSize: 24, fontWeight: 800, color: totals.coverage >= 1.5 ? '#22c55e' : (totals.coverage >= 1 ? '#f59e0b' : '#ef4444') }}>{totals.coverage > 100 ? '∞' : totals.coverage.toFixed(2) + 'x'}</div><div style={{ fontSize: 11, color: '#64748b' }}>{totals.coverage >= 1.5 ? 'Safe to Leverage' : (totals.coverage >= 1 ? 'Caution' : 'Critical')}</div></div></>)
          })()}
        </div>
      )}
      {insightTab === 'summary' && <div style={{ padding: 15 }}><CategoryBreakdown /></div>}
      {breakdownModal && <BreakdownModal {...breakdownModal} />}
    </div>
  )
}
