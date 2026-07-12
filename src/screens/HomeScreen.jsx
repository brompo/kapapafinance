import React, { useState, useMemo, useEffect } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, calculateAssetMetrics, monthKey, todayISO, fmtCompact } from '../money'
import { CategoryDetail } from './CategoryDetail'
import { computePipeline } from '../utils/pipeline'

// Transactions tab: the single system of record for every real transaction (income,
// expenses, allocations, and — when Flow is enabled — collections/growth too).
// The Flow tab (separate, opt-in) is a read-only budget plan layered on top.
export function HomeScreen() {
  return <ClassicHomeScreen />
}

function ClassicHomeScreen() {
  const {
    month, shiftMonth, formatMonthLabel,
    activeLedger, accounts, accountTxns, settings,
    filteredTxns, expenseCats, incomeCats, categories, categoryMeta,
    kpis, persistActiveLedger, show, selectedCategory, setSelectedCategory,
    showAddForm, setShowAddForm, highlightId, setHighlightId,
    setShowLedgerPicker, showLedgerPicker, ledgers, handleSelectLedger,
    handleUpdateLedger, handleDeleteLedger, handleAddPersonalLedger, handleAddBusinessLedger,
    clients, addQuickTxn
  } = useAppContext()

  // Flow Pipeline (Settings → Features), personal ledgers only: swaps the plain
  // Income section for Collections (with compliance tracking) and adds a Growth section
  // of linkable spend categories. The Flow tab reads the same data as a report.
  const pipelineMode = activeLedger.type === 'personal' && !!settings.moneyPipelineEnabled
  // Collections/allocation reuse the Income/Lifestyle category+meta lists — there's no
  // separate categoryMeta bucket for Collections, so route reads/writes through 'income'.
  const metaTypeFor = (type) => type === 'collection' ? 'income' : type

  const monthLabel = useMemo(() => formatMonthLabel(month), [month, formatMonthLabel])

  const [collapseExpense, setCollapseExpense] = useState(() => localStorage.getItem('collapse_expense') === 'true')
  const [collapseAllocation, setCollapseAllocation] = useState(() => localStorage.getItem('collapse_allocation') === 'true')
  const [collapseIncome, setCollapseIncome] = useState(() => localStorage.getItem('collapse_income') === 'true')
  const [collapseCos, setCollapseCos] = useState(() => localStorage.getItem('collapse_cos') === 'true')
  const [collapseOpps, setCollapseOpps] = useState(() => localStorage.getItem('collapse_opps') === 'true')

  const allocationCats = categories.allocation || []
  const cosCats = categories.cos || []
  const oppsCats = categories.opps || []

  const allocationTotals = useMemo(() => {
    const map = new Map()
    for (const c of allocationCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if (t.type === 'allocation') {
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
    }
    return map
  }, [filteredTxns, allocationCats])

  const expenseTotals = useMemo(() => {
    const map = new Map()
    for (const c of expenseCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if (t.type === 'expense') {
        const key = t.category || 'Other'
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0) - reimbursed)
      }
    }
    return map
  }, [filteredTxns, expenseCats])

  const cosTotals = useMemo(() => {
    const map = new Map()
    for (const c of cosCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if (t.type === 'cos') {
        const key = t.category || 'Other'
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0) - reimbursed)
      }
    }
    return map
  }, [filteredTxns, cosCats])

  const oppsTotals = useMemo(() => {
    const map = new Map()
    for (const c of oppsCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if (t.type === 'opps') {
        const key = t.category || 'Other'
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0) - reimbursed)
      }
    }
    return map
  }, [filteredTxns, oppsCats])

  const incomeTotals = useMemo(() => {
    const map = new Map()
    for (const c of incomeCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if ((t.type === 'income' || t.type === 'collection') && !t.reimbursementOf) {
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
    }
    const assets = accounts.filter(a => {
      const g = activeLedger.groups.find(g => g.id === a.groupId);
      return g && g.type === 'asset';
    });
    for (const acc of assets) {
      const info = calculateAssetMetrics(acc, accountTxns, 'asset');
      const monthsGains = info.realizedGains.filter(g => monthKey(g.date) === month);
      for (const g of monthsGains) {
        const cat = g.category || 'Capital Gains';
        map.set(cat, (map.get(cat) || 0) + g.amount);
      }
    }
    return map
  }, [filteredTxns, incomeCats, accounts, activeLedger.groups, accountTxns, month])

  const pipeline = useMemo(() => pipelineMode ? computePipeline(filteredTxns, activeLedger, month) : null, [pipelineMode, filteredTxns, activeLedger, month])

  const collectionTotals = useMemo(() => {
    const map = new Map()
    for (const c of incomeCats) map.set(c, 0)
    for (const r of (pipeline?.collectionRows || [])) {
      const key = r.category || 'Other'
      map.set(key, (map.get(key) || 0) + Number(r.amount || 0))
    }
    return map
  }, [pipeline, incomeCats])

  const growthCats = categories.growth || []
  const growthTotals = useMemo(() => {
    const map = new Map()
    for (const c of growthCats) map.set(c, 0)
    for (const t of filteredTxns) {
      if (t.type === 'growth') {
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
    }
    return map
  }, [filteredTxns, growthCats])

  const [collapseGrowth, setCollapseGrowth] = useState(() => localStorage.getItem('collapse_growth') === 'true')
  useEffect(() => { localStorage.setItem('collapse_growth', collapseGrowth) }, [collapseGrowth])

  useEffect(() => { localStorage.setItem('collapse_expense', collapseExpense) }, [collapseExpense])
  useEffect(() => { localStorage.setItem('collapse_income', collapseIncome) }, [collapseIncome])
  useEffect(() => { localStorage.setItem('collapse_cos', collapseCos) }, [collapseCos])
  useEffect(() => { localStorage.setItem('collapse_opps', collapseOpps) }, [collapseOpps])
  useEffect(() => { localStorage.setItem('collapse_allocation', collapseAllocation) }, [collapseAllocation])

  const displayIncome = incomeCats.reduce((s, c) => s + (incomeTotals.get(c) || 0), 0)
  const displayExp = expenseCats.reduce((s, c) => s + (expenseTotals.get(c) || 0), 0)
    + cosCats.reduce((s, c) => s + (cosTotals.get(c) || 0), 0)
    + oppsCats.reduce((s, c) => s + (oppsTotals.get(c) || 0), 0)
  const displayAlloc = allocationCats.reduce((s, c) => s + (allocationTotals.get(c) || 0), 0)
  const displayBalance = displayIncome - displayExp - displayAlloc

  const addCategory = (type) => {
    const name = prompt(`New ${type} category name?`)
    if (!name?.trim()) return
    const next = [...(categories[type] || []), name.trim()]
    persistActiveLedger({ 
      ...activeLedger, 
      categories: { ...categories, [type]: next },
      categoryMeta: { ...categoryMeta, [type]: { ...categoryMeta[type], [name.trim()]: { budget: 0, subs: [] } } }
    })
  }

  if (selectedCategory) {
    return (
      <CategoryDetail
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        cosCats={cosCats}
        oppsCats={oppsCats}
        allocationCats={allocationCats}
        growthCats={growthCats}
        meta={categoryMeta[metaTypeFor(selectedCategory.type)]?.[selectedCategory.name]}
        total={
          selectedCategory.type === 'expense' ? (expenseTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'income' ? (incomeTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'collection' ? (collectionTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'cos' ? (cosTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'opps' ? (oppsTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'growth' ? (growthTotals.get(selectedCategory.name) || 0) :
          (allocationTotals.get(selectedCategory.name) || 0)
        }
        onUpdateMeta={(next) => {
          const metaType = metaTypeFor(selectedCategory.type)
          const nextMeta = { ...categoryMeta, [metaType]: { ...categoryMeta[metaType], [selectedCategory.name]: next } }
          persistActiveLedger({ ...activeLedger, categoryMeta: nextMeta })
        }}
      />
    )
  }

  return (
    <div className="ledgerScreen">
      <div className="ledgerHeader">
        <button className="ledgerGhost" onClick={() => setShowLedgerPicker(true)}>{activeLedger.name || 'Personal'} ▾</button>
        <div className="ledgerPeriod">
          <button className="ledgerNavBtn" onClick={() => shiftMonth(-1)}>‹</button>
          <div className="ledgerPeriodLabel">{monthLabel}</div>
          <button className="ledgerNavBtn" onClick={() => shiftMonth(1)}>›</button>
        </div>
        <div className="ledgerRatio">
          <span>{displayIncome ? ((displayExp / displayIncome) * 100).toFixed(2) : '0.00'}%</span>
          <span className="ledgerRatioDot">◔</span>
        </div>
      </div>

      <div className={`ledgerSummaryCard ${displayBalance < 0 ? 'neg' : 'pos'}`}>
        <div className="ledgerSummaryBalanceRow">
          <span className="ledgerSummaryBalanceLabel">Balance</span>
          <span className="ledgerSummaryBalanceValue">{fmtTZS(displayBalance)}</span>
        </div>
        <div className="ledgerSummaryRow">
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Income</span>
            <span className="ledgerStatValue kpi-income">{fmtTZS(displayIncome)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Exp</span>
            <span className="ledgerStatValue kpi-expense">{fmtTZS(displayExp)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Alloc</span>
            <span className="ledgerStatValue kpi-alloc">{fmtTZS(displayAlloc)}</span>
          </div>
        </div>
      </div>

      {/* Ledger picker now global in App.jsx */}

      {[
        pipelineMode
          ? { title: 'Collections', type: 'collection', list: incomeCats, totals: collectionTotals, kpi: incomeCats.reduce((s, c) => s + (collectionTotals.get(c) || 0), 0), collapse: collapseIncome, setCollapse: setCollapseIncome, theme: 4, note: pipeline?.isLegacyFallback ? 'No Collections recorded yet this month — totals include legacy income entries shown as already-clean.' : null }
          : { title: 'Income', type: 'income', list: incomeCats, totals: incomeTotals, kpi: incomeCats.reduce((s, c) => s + (incomeTotals.get(c) || 0), 0), collapse: collapseIncome, setCollapse: setCollapseIncome, theme: 4 },
        { title: 'Expenses', type: 'expense', list: expenseCats, totals: expenseTotals, kpi: expenseCats.reduce((s, c) => s + (expenseTotals.get(c) || 0), 0), collapse: collapseExpense, setCollapse: setCollapseExpense, theme: 1 },
        { title: 'Lifestyle', type: 'allocation', list: allocationCats, totals: allocationTotals, kpi: allocationCats.reduce((s, c) => s + (allocationTotals.get(c) || 0), 0), collapse: collapseAllocation, setCollapse: setCollapseAllocation, theme: 2 },
        ...(pipelineMode ? [{ title: 'Growth', type: 'growth', list: growthCats, totals: growthTotals, kpi: growthCats.reduce((s, c) => s + (growthTotals.get(c) || 0), 0), collapse: collapseGrowth, setCollapse: setCollapseGrowth, theme: 4 }] : []),
        { title: 'Cost of Sales', type: 'cos', list: cosCats, totals: cosTotals, kpi: cosCats.reduce((s, c) => s + (cosTotals.get(c) || 0), 0), collapse: collapseCos, setCollapse: setCollapseCos, theme: 3 },
        { title: 'Operating Expenses', type: 'opps', list: oppsCats, totals: oppsTotals, kpi: oppsCats.reduce((s, c) => s + (oppsTotals.get(c) || 0), 0), collapse: collapseOpps, setCollapse: setCollapseOpps, theme: 5 },
      ].map(sec => {
        if (sec.list.length === 0 && (sec.type === 'cos' || sec.type === 'opps' || sec.type === 'allocation' || sec.type === 'growth')) return null;
        return (
          <div className="ledgerSection" key={sec.type}>
            <div className="ledgerSectionHead">
              <div className="ledgerSectionTitle">{sec.title} <span className="ledgerSectionTotal">{fmtTZS(sec.kpi)}</span></div>
              <div className="ledgerSectionActions">
                <button className="ledgerAddBtn" onClick={() => addCategory(sec.type)}>+ Add</button>
                <button className="ledgerCollapseBtn" onClick={() => sec.setCollapse(!sec.collapse)}>{sec.collapse ? '▸' : '▾'}</button>
              </div>
            </div>
            {sec.note && (
              <div style={{ padding: '0 12px 8px', fontSize: 11, color: '#8b90b2' }}>{sec.note}</div>
            )}
            {!sec.collapse && (
              <div className="ledgerGrid">
                {sec.list.map((c, i) => (
                  <div key={c} className={`ledgerCard theme-${(i % 6) + sec.theme}`} onClick={() => setSelectedCategory({ type: sec.type, name: c, theme: `theme-${(i % 6) + sec.theme}` })}>
                    <div className="ledgerCardTitle">{c}</div>
                    <div className="ledgerCardIcon">{(c || '').slice(0, 1).toUpperCase()}</div>
                    <div className="ledgerCardValue">{fmtTZS(sec.totals.get(c) || 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
