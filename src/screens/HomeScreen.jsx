import React, { useState, useMemo, useEffect } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, calculateAssetMetrics, monthKey, todayISO, fmtCompact } from '../money'
import { CategoryDetail } from './CategoryDetail'

export function HomeScreen() {
  const { 
    month, shiftMonth, formatMonthLabel, 
    activeLedger, accounts, accountTxns, 
    filteredTxns, expenseCats, incomeCats, categories, categoryMeta,
    kpis, persistActiveLedger, show, selectedCategory, setSelectedCategory,
    showAddForm, setShowAddForm, highlightId, setHighlightId,
    setShowLedgerPicker, showLedgerPicker, ledgers, handleSelectLedger,
    handleUpdateLedger, handleDeleteLedger, handleAddPersonalLedger, handleAddBusinessLedger,
    clients, addQuickTxn
  } = useAppContext()

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
      if (t.type === 'income' && !t.reimbursementOf) {
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

  useEffect(() => { localStorage.setItem('collapse_expense', collapseExpense) }, [collapseExpense])
  useEffect(() => { localStorage.setItem('collapse_income', collapseIncome) }, [collapseIncome])
  useEffect(() => { localStorage.setItem('collapse_cos', collapseCos) }, [collapseCos])
  useEffect(() => { localStorage.setItem('collapse_opps', collapseOpps) }, [collapseOpps])
  useEffect(() => { localStorage.setItem('collapse_allocation', collapseAllocation) }, [collapseAllocation])

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
        meta={categoryMeta[selectedCategory.type]?.[selectedCategory.name]}
        total={
          selectedCategory.type === 'expense' ? (expenseTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'income' ? (incomeTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'cos' ? (cosTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'opps' ? (oppsTotals.get(selectedCategory.name) || 0) :
          (allocationTotals.get(selectedCategory.name) || 0)
        }
        onUpdateMeta={(next) => {
          const nextMeta = { ...categoryMeta, [selectedCategory.type]: { ...categoryMeta[selectedCategory.type], [selectedCategory.name]: next } }
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
          <span>{kpis.inc ? ((kpis.exp / kpis.inc) * 100).toFixed(2) : '0.00'}%</span>
          <span className="ledgerRatioDot">◔</span>
        </div>
      </div>

      <div className={`ledgerSummary ${kpis.monthlyBalance < 0 ? 'neg' : 'pos'}`}>
        <div className="ledgerSummaryLabel">Balance</div>
        <div className="ledgerSummaryValue">{fmtTZS(kpis.monthlyBalance)}</div>
        <span className="ledgerSummaryCaret">▾</span>
      </div>

      {/* Ledger picker now global in App.jsx */}

      {[
        { title: 'Income', type: 'income', list: incomeCats, totals: incomeTotals, kpi: [...incomeTotals.values()].reduce((s,v)=>s+v, 0), collapse: collapseIncome, setCollapse: setCollapseIncome, theme: 4 },
        { title: 'Expenses', type: 'expense', list: expenseCats, totals: expenseTotals, kpi: [...expenseTotals.values()].reduce((s,v)=>s+v, 0), collapse: collapseExpense, setCollapse: setCollapseExpense, theme: 1 },
        { title: 'Allocations', type: 'allocation', list: allocationCats, totals: allocationTotals, kpi: [...allocationTotals.values()].reduce((s,v)=>s+v, 0), collapse: collapseAllocation, setCollapse: setCollapseAllocation, theme: 2 },
        { title: 'Cost of Sales', type: 'cos', list: cosCats, totals: cosTotals, kpi: [...cosTotals.values()].reduce((s,v)=>s+v, 0), collapse: collapseCos, setCollapse: setCollapseCos, theme: 3 },
        { title: 'Operating Expenses', type: 'opps', list: oppsCats, totals: oppsTotals, kpi: [...oppsTotals.values()].reduce((s,v)=>s+v, 0), collapse: collapseOpps, setCollapse: setCollapseOpps, theme: 5 },
      ].map(sec => {
        if (sec.list.length === 0 && (sec.type === 'cos' || sec.type === 'opps' || sec.type === 'allocation')) return null;
        return (
          <div className="ledgerSection" key={sec.type}>
            <div className="ledgerSectionHead">
              <div className="ledgerSectionTitle">{sec.title} <span className="ledgerSectionTotal">{fmtTZS(sec.kpi)}</span></div>
              <div className="ledgerSectionActions">
                <button className="ledgerAddBtn" onClick={() => addCategory(sec.type)}>+ Add</button>
                <button className="ledgerCollapseBtn" onClick={() => sec.setCollapse(!sec.collapse)}>{sec.collapse ? '▸' : '▾'}</button>
              </div>
            </div>
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
