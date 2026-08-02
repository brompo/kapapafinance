import React, { useState, useMemo, useEffect } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, calculateAssetMetrics, monthKey, todayISO, fmtCompact } from '../money'
import { CategoryDetail } from './CategoryDetail'
import { computeIncome } from '../utils/pipeline'
import { computeEnvelopeSummary } from '../utils/envelopes'

// Transactions tab: the single system of record for personal expense/income
// (and Lifestyle/Growth, if you've logged anything under those). Flow and
// Kapapa (separate, opt-in tabs) are independent books with their own
// budget-cascade math — this screen never shows cascade/balance figures,
// only plain totals.
//
// CategoryDetail is also reused, unchanged, by Flow/Kapapa: tapping a row
// there sets `selectedCategory` while `tab` stays 'flow'/'kapapa', which
// mounts this component (see App.jsx's `tab === 'tx' || selectedCategory`)
// so the same add/edit-transaction UI works against whichever book is
// current — `isEnvelopeBook` below is what tells the two cases apart.
export function HomeScreen() {
  return <ClassicHomeScreen />
}

function ClassicHomeScreen() {
  const {
    month, shiftMonth, formatMonthLabel, tab,
    accounts, accountTxns, settings, groups,
    txns, filteredTxns, expenseCats, incomeCats, categories, categoryMeta,
    persistBook, show, selectedCategory, setSelectedCategory,
    showAddForm, setShowAddForm,
    clients, addQuickTxn
  } = useAppContext()

  // Flow/Kapapa (opt-in books) get the budget-cascade treatment — Collections
  // instead of plain Income, and Lifestyle/Growth cards show Balance instead
  // of a flat sum. Transaction itself never does.
  const isEnvelopeBook = tab !== 'tx'
  // Collections/allocation reuse the Income/Lifestyle category+meta lists — there's no
  // separate categoryMeta bucket for Collections, so route reads/writes through 'income'.
  const metaTypeFor = (type) => type === 'collection' ? 'income' : type

  const monthLabel = useMemo(() => formatMonthLabel(month), [month, formatMonthLabel])

  const [collapseExpense, setCollapseExpense] = useState(() => localStorage.getItem('collapse_expense') === 'true')
  const [collapseAllocation, setCollapseAllocation] = useState(() => localStorage.getItem('collapse_allocation') === 'true')
  const [collapseIncome, setCollapseIncome] = useState(() => localStorage.getItem('collapse_income') === 'true')

  const allocationCats = categories.allocation || []

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
      const g = groups.find(g => g.id === a.groupId);
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
  }, [filteredTxns, incomeCats, accounts, groups, accountTxns, month])

  const incomeInfo = useMemo(() => isEnvelopeBook ? computeIncome(filteredTxns) : null, [isEnvelopeBook, filteredTxns])

  const collectionTotals = useMemo(() => {
    const map = new Map()
    for (const c of incomeCats) map.set(c, 0)
    for (const r of (incomeInfo?.collectionRows || [])) {
      const key = r.category || 'Other'
      map.set(key, (map.get(key) || 0) + Number(r.amount || 0))
    }
    return map
  }, [incomeInfo, incomeCats])

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

  // Only meaningful for Flow/Kapapa (isEnvelopeBook) — cheap enough to always
  // compute against whichever book is current.
  const envelopeSummary = useMemo(
    () => computeEnvelopeSummary({ txns, categories, categoryMeta }, month),
    [txns, categories, categoryMeta, month]
  )

  const growthBalances = useMemo(() => {
    const map = new Map()
    for (const p of envelopeSummary.growth) map.set(p.name, p.balance)
    return map
  }, [envelopeSummary])

  const lifestyleBalances = useMemo(() => {
    const map = new Map()
    for (const b of envelopeSummary.lifestyle) map.set(b.name, b.balance)
    return map
  }, [envelopeSummary])

  const lifestyleSpentTotals = useMemo(() => {
    const map = new Map()
    for (const b of envelopeSummary.lifestyle) map.set(b.name, b.spentTotal)
    return map
  }, [envelopeSummary])

  const growthSpentTotals = useMemo(() => {
    const map = new Map()
    for (const p of envelopeSummary.growth) map.set(p.name, p.spentTotal)
    return map
  }, [envelopeSummary])

  const lifestyleCardTotals = isEnvelopeBook ? lifestyleSpentTotals : allocationTotals
  const lifestyleDetailTotal = isEnvelopeBook ? lifestyleBalances : allocationTotals
  const growthCardTotals = isEnvelopeBook ? growthSpentTotals : growthTotals
  const growthDetailTotal = isEnvelopeBook ? growthBalances : growthTotals

  const [collapseGrowth, setCollapseGrowth] = useState(() => localStorage.getItem('collapse_growth') === 'true')
  useEffect(() => { localStorage.setItem('collapse_growth', collapseGrowth) }, [collapseGrowth])

  useEffect(() => { localStorage.setItem('collapse_expense', collapseExpense) }, [collapseExpense])
  useEffect(() => { localStorage.setItem('collapse_income', collapseIncome) }, [collapseIncome])
  useEffect(() => { localStorage.setItem('collapse_allocation', collapseAllocation) }, [collapseAllocation])

  const displayIncome = incomeCats.reduce((s, c) => s + (incomeTotals.get(c) || 0), 0)
  const displayExp = expenseCats.reduce((s, c) => s + (expenseTotals.get(c) || 0), 0)
  const displayAlloc = allocationCats.reduce((s, c) => s + (allocationTotals.get(c) || 0), 0)
  const displayBalance = displayIncome - displayExp - displayAlloc

  const addCategory = (type) => {
    const name = prompt(`New ${type} category name?`)
    if (!name?.trim()) return
    const next = [...(categories[type] || []), name.trim()]
    persistBook({
      categories: { ...categories, [type]: next },
      categoryMeta: { ...categoryMeta, [type]: { ...categoryMeta[type], [name.trim()]: { budget: 0, subs: [] } } }
    })
  }

  if (selectedCategory) {
    return (
      <CategoryDetail
        category={selectedCategory}
        month={month}
        onClose={() => setSelectedCategory(null)}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        allocationCats={allocationCats}
        growthCats={growthCats}
        meta={categoryMeta[metaTypeFor(selectedCategory.type)]?.[selectedCategory.name]}
        total={
          selectedCategory.type === 'expense' ? (expenseTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'income' ? (incomeTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'collection' ? (collectionTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'growth' ? (growthDetailTotal.get(selectedCategory.name) || 0) :
          (lifestyleDetailTotal.get(selectedCategory.name) || 0)
        }
        onUpdateMeta={(next) => {
          const metaType = metaTypeFor(selectedCategory.type)
          const nextMeta = { ...categoryMeta, [metaType]: { ...categoryMeta[metaType], [selectedCategory.name]: next } }
          persistBook({ categoryMeta: nextMeta })
        }}
      />
    )
  }

  return (
    <div className="ledgerScreen">
      <div className="ledgerHeader">
        <div className="ledgerGhost" style={{ cursor: 'default' }}>Transaction</div>
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
          {isEnvelopeBook && (
            <>
              <div className="ledgerSummaryDivider" />
              <div className="ledgerSummaryStat">
                <span className="ledgerStatLabel">Alloc</span>
                <span className="ledgerStatValue kpi-alloc">{fmtTZS(displayAlloc)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {[
        isEnvelopeBook
          ? { title: 'Collections', type: 'collection', list: incomeCats, totals: collectionTotals, kpi: incomeCats.reduce((s, c) => s + (collectionTotals.get(c) || 0), 0), collapse: collapseIncome, setCollapse: setCollapseIncome, theme: 4, note: incomeInfo?.isLegacyFallback ? 'No Collections recorded yet this month — totals include legacy income entries shown as already-clean.' : null }
          : { title: 'Income', type: 'income', list: incomeCats, totals: incomeTotals, kpi: incomeCats.reduce((s, c) => s + (incomeTotals.get(c) || 0), 0), collapse: collapseIncome, setCollapse: setCollapseIncome, theme: 4 },
        { title: 'Expenses', type: 'expense', list: expenseCats, totals: expenseTotals, kpi: expenseCats.reduce((s, c) => s + (expenseTotals.get(c) || 0), 0), collapse: collapseExpense, setCollapse: setCollapseExpense, theme: 1 },
        // Lifestyle/Growth are Flow/Kapapa's budget-cascade concepts — Transaction
        // itself stays to plain Income/Expenses only, see module comment above.
        ...(isEnvelopeBook ? [
          { title: 'Lifestyle', type: 'allocation', list: allocationCats, totals: lifestyleCardTotals, kpi: allocationCats.reduce((s, c) => s + (lifestyleCardTotals.get(c) || 0), 0), collapse: collapseAllocation, setCollapse: setCollapseAllocation, theme: 2, secondaryTotals: lifestyleBalances },
          { title: 'Growth', type: 'growth', list: growthCats, totals: growthCardTotals, kpi: growthCats.reduce((s, c) => s + (growthCardTotals.get(c) || 0), 0), collapse: collapseGrowth, setCollapse: setCollapseGrowth, theme: 4, secondaryTotals: growthBalances },
        ] : []),
      ].map(sec => {
        if (sec.list.length === 0 && (sec.type === 'allocation' || sec.type === 'growth')) return null;
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
                {sec.list.map((c, i) => {
                  const fundsUpkeep = sec.type === 'growth' && !!categoryMeta.growth?.[c]?.fundsUpkeep
                  return (
                    <div
                      key={c}
                      className={`ledgerCard theme-${(i % 6) + sec.theme}`}
                      style={fundsUpkeep ? { opacity: 0.55 } : undefined}
                      onClick={() => setSelectedCategory({ type: sec.type, name: c, theme: `theme-${(i % 6) + sec.theme}` })}
                    >
                      <div className="ledgerCardTitle">{c}</div>
                      <div className="ledgerCardIcon">{(c || '').slice(0, 1).toUpperCase()}</div>
                      <div className="ledgerCardValue">{fmtTZS(sec.totals.get(c) || 0)}</div>
                      {fundsUpkeep ? (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginTop: 2 }}>→ Upkeep</div>
                      ) : sec.secondaryTotals && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginTop: 2 }}>Bal: {fmtTZS(sec.secondaryTotals.get(c) || 0)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
