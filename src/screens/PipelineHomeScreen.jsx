import React, { useState, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS } from '../money'
import { CategoryDetail } from './CategoryDetail'
import { computePipeline } from '../utils/pipeline'

// Matches the accent colors of .ledgerCard.theme-2 .. theme-7 in styles.css (the
// themes Family Happiness cards cycle through), so the fill tint matches each card.
const FAMILY_THEME_FILL_COLORS = ['#a87dfb', '#fb923c', '#38bdf8', '#f472b6', '#4ade80', '#fbbf24']

export function PipelineHomeScreen() {
  const {
    month, shiftMonth, formatMonthLabel,
    activeLedger,
    filteredTxns, expenseCats, categories, categoryMeta,
    persistActiveLedger, show, selectedCategory, setSelectedCategory,
    showAddForm, setShowAddForm,
    setShowLedgerPicker
  } = useAppContext()

  const monthLabel = useMemo(() => formatMonthLabel(month), [month, formatMonthLabel])
  const [collapse, setCollapse] = useState({})
  const toggleCollapse = (key) => setCollapse(c => ({ ...c, [key]: !c[key] }))

  const allocationCats = categories.allocation || []
  const incomeCats = categories.income || []

  const pipeline = useMemo(() => computePipeline(filteredTxns, activeLedger, month), [filteredTxns, activeLedger, month])

  // Collections reuse the same category list as Income (Salary, Business, ...) —
  // there is no separate "source" list. Totals are gross, grouped by that category.
  const collectionTotals = useMemo(() => {
    const map = new Map()
    for (const c of incomeCats) map.set(c, 0)
    for (const r of pipeline.collectionRows) {
      const key = r.category || 'Other'
      map.set(key, (map.get(key) || 0) + Number(r.amount || 0))
    }
    return map
  }, [pipeline.collectionRows, incomeCats])

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

  const legacyAllocationTotals = useMemo(() => {
    const map = new Map()
    for (const t of filteredTxns) {
      if (t.type === 'allocation') {
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
    }
    return map
  }, [filteredTxns])

  const askAmount = (label, current) => {
    const val = prompt(`${label} (TZS)?`, String(current || 0))
    if (val == null) return null
    const n = Number(String(val).replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0) { show('Enter a valid amount.'); return null }
    return n
  }

  const editUpkeepTarget = () => {
    const n = askAmount('Upkeep target', pipeline.upkeepTarget)
    if (n == null) return
    persistActiveLedger({ ...activeLedger, pipeline: { ...activeLedger.pipeline, upkeepTarget: n } })
  }

  const addBucket = () => {
    const name = prompt('New Family Happiness bucket name?')
    if (!name?.trim()) return
    const trimmed = name.trim()
    const nextPriority = allocationCats.reduce((max, n) => Math.max(max, Number(categoryMeta.allocation?.[n]?.priority) || 0), 0) + 1
    persistActiveLedger({
      ...activeLedger,
      categories: { ...categories, allocation: [...allocationCats, trimmed] },
      categoryMeta: { ...categoryMeta, allocation: { ...categoryMeta.allocation, [trimmed]: { budget: 0, subs: [], priority: nextPriority } } }
    })
  }

  const swapBucketPriority = (name, direction) => {
    const sorted = [...allocationCats].sort((a, b) =>
      (categoryMeta.allocation?.[a]?.priority ?? Infinity) - (categoryMeta.allocation?.[b]?.priority ?? Infinity))
    const idx = sorted.indexOf(name)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    const meta = categoryMeta.allocation
    const p1 = meta[name]?.priority ?? idx + 1
    const p2 = meta[other]?.priority ?? swapIdx + 1
    persistActiveLedger({
      ...activeLedger,
      categoryMeta: {
        ...categoryMeta,
        allocation: {
          ...meta,
          [name]: { ...meta[name], priority: p2 },
          [other]: { ...meta[other], priority: p1 }
        }
      }
    })
  }

  const addCollectionCategory = () => {
    const name = prompt('New income/collection category name?')
    if (!name?.trim()) return
    const trimmed = name.trim()
    persistActiveLedger({
      ...activeLedger,
      categories: { ...categories, income: [...incomeCats, trimmed] },
      categoryMeta: { ...categoryMeta, income: { ...categoryMeta.income, [trimmed]: { budget: 0, subs: [] } } }
    })
  }

  const addExpenseCategory = () => {
    const name = prompt('New expense category name?')
    if (!name?.trim()) return
    const trimmed = name.trim()
    persistActiveLedger({
      ...activeLedger,
      categories: { ...categories, expense: [...expenseCats, trimmed] },
      categoryMeta: { ...categoryMeta, expense: { ...categoryMeta.expense, [trimmed]: { budget: 0, subs: [] } } }
    })
  }

  const editGrowthPercent = (id) => {
    const pool = activeLedger.pipeline.growthPools.find(p => p.id === id)
    const val = prompt(`${pool.name} percent (0-100)?`, String(pool.percent || 0))
    if (val == null) return
    const n = Number(val)
    if (!Number.isFinite(n) || n < 0) return show('Enter a valid percent.')
    persistActiveLedger({
      ...activeLedger,
      pipeline: {
        ...activeLedger.pipeline,
        growthPools: activeLedger.pipeline.growthPools.map(p => p.id === id ? { ...p, percent: n } : p)
      }
    })
  }

  // Collections piggyback on the Income category list/meta — there's no separate
  // categoryMeta bucket for them, so route reads/writes through 'income' instead.
  const metaTypeFor = (type) => type === 'collection' ? 'income' : type

  if (selectedCategory) {
    return (
      <CategoryDetail
        category={selectedCategory}
        onClose={() => setSelectedCategory(null)}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        cosCats={[]}
        oppsCats={[]}
        allocationCats={allocationCats}
        meta={categoryMeta[metaTypeFor(selectedCategory.type)]?.[selectedCategory.name]}
        total={
          selectedCategory.type === 'expense' ? (expenseTotals.get(selectedCategory.name) || 0) :
          selectedCategory.type === 'collection' ? (collectionTotals.get(selectedCategory.name) || 0) :
          (legacyAllocationTotals.get(selectedCategory.name) || 0)
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
        <div style={{ width: 40 }} />
      </div>

      <div className={`ledgerSummaryCard ${pipeline.remainder < 0 ? 'neg' : 'pos'}`}>
        <div className="ledgerSummaryBalanceRow">
          <span className="ledgerSummaryBalanceLabel">Recognized Income</span>
          <span className="ledgerSummaryBalanceValue">{fmtTZS(pipeline.income)}</span>
        </div>
        <div className="ledgerSummaryRow">
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Collected</span>
            <span className="ledgerStatValue">{fmtTZS(pipeline.totalCollected)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Compliance Held</span>
            <span className="ledgerStatValue">{fmtTZS(pipeline.complianceHeld)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Income</span>
            <span className="ledgerStatValue" style={{ color: '#eda100' }}>{fmtTZS(pipeline.income)}</span>
          </div>
        </div>
        <div className="ledgerSummaryRow">
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Upkeep</span>
            <span className="ledgerStatValue kpi-expense">{fmtTZS(pipeline.upkeepActual)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Fam. Happiness</span>
            <span className="ledgerStatValue kpi-alloc">{fmtTZS(pipeline.familyHappinessSpent)}</span>
          </div>
          <div className="ledgerSummaryDivider" />
          <div className="ledgerSummaryStat">
            <span className="ledgerStatLabel">Surplus</span>
            <span className="ledgerStatValue" style={{ color: pipeline.growthSurplus < 0 ? '#e05260' : '#2bb06a' }}>{fmtTZS(pipeline.growthSurplus)}</span>
          </div>
        </div>
      </div>

      {/* 1. Collections — same category list as Income, same card grid pattern */}
      <div className="ledgerSection">
        <div className="ledgerSectionHead">
          <div className="ledgerSectionTitle">Collections <span className="ledgerSectionTotal">{fmtTZS(pipeline.totalCollected)}</span></div>
          <div className="ledgerSectionActions">
            <button className="ledgerAddBtn" onClick={addCollectionCategory}>+ Add</button>
            <button className="ledgerCollapseBtn" onClick={() => toggleCollapse('collections')}>{collapse.collections ? '▸' : '▾'}</button>
          </div>
        </div>
        {pipeline.isLegacyFallback && (
          <div style={{ padding: '0 12px 8px', fontSize: 11, color: '#8b90b2' }}>
            No Collections recorded yet this month — totals include legacy income entries shown as already-clean.
          </div>
        )}
        {!collapse.collections && (
          <div className="ledgerGrid">
            {incomeCats.map((c, i) => (
              <div key={c} className={`ledgerCard theme-${(i % 6) + 4}`} onClick={() => setSelectedCategory({ type: 'collection', name: c, theme: `theme-${(i % 6) + 4}` })}>
                <div className="ledgerCardTitle">{c}</div>
                <div className="ledgerCardIcon">{(c || '').slice(0, 1).toUpperCase()}</div>
                <div className="ledgerCardValue">{fmtTZS(collectionTotals.get(c) || 0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Income */}
      <div className={`ledgerSummaryCard ${pipeline.income < 0 ? 'neg' : 'pos'}`}>
        <div className="ledgerSummaryBalanceRow" style={!pipeline.isLegacyFallback ? { borderBottom: 'none', paddingBottom: 0 } : undefined}>
          <span className="ledgerSummaryBalanceLabel">Income</span>
          <span className="ledgerSummaryBalanceValue">{fmtTZS(pipeline.income)}</span>
        </div>
        {pipeline.isLegacyFallback && (
          <div style={{ padding: '6px 0 2px', fontSize: 11, color: '#8b90b2', textAlign: 'center' }}>
            Showing legacy income entries as clean collections.
          </div>
        )}
      </div>

      {/* 3. Upkeep — deduction is actual spend against these Expense categories */}
      <div className="ledgerSection">
        <div className="ledgerSectionHead">
          <div className="ledgerSectionTitle">Upkeep <span className="ledgerSectionTotal">{fmtTZS(pipeline.upkeepActual)}</span></div>
          <div className="ledgerSectionActions">
            <button className="ledgerAddBtn" onClick={addExpenseCategory}>+ Add</button>
            <button className="ledgerCollapseBtn" onClick={() => toggleCollapse('upkeep')}>{collapse.upkeep ? '▸' : '▾'}</button>
          </div>
        </div>
        <div style={{ padding: '0 12px 12px', fontSize: 11, color: '#8b90b2' }}>
          Budget target: <strong onClick={editUpkeepTarget} style={{ cursor: 'pointer', color: '#6366f1' }}>{fmtTZS(pipeline.upkeepTarget)}</strong> (tap to edit)
          {' • '}Actual spend: <strong>{fmtTZS(pipeline.upkeepActual)}</strong>
          <br />
          Surplus after upkeep: <strong style={{ color: pipeline.remainder < 0 ? '#e05260' : '#2bb06a' }}>{fmtTZS(pipeline.remainder)}</strong>
          {pipeline.remainder < 0 && ' — Upkeep spend exceeds Income, nothing flows to Family Happiness or Growth.'}
        </div>
        {!collapse.upkeep && (
          <div className="ledgerGrid">
            {expenseCats.map((c, i) => (
              <div key={c} className={`ledgerCard theme-${(i % 6) + 1}`} onClick={() => setSelectedCategory({ type: 'expense', name: c, theme: `theme-${(i % 6) + 1}` })}>
                <div className="ledgerCardTitle">{c}</div>
                <div className="ledgerCardIcon">{(c || '').slice(0, 1).toUpperCase()}</div>
                <div className="ledgerCardValue">{fmtTZS(expenseTotals.get(c) || 0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Family Happiness */}
      <div className="ledgerSection">
        <div className="ledgerSectionHead">
          <div className="ledgerSectionTitle">Family Happiness <span className="ledgerSectionTotal">{fmtTZS(pipeline.familyHappinessSpent)}</span></div>
          <div className="ledgerSectionActions">
            <button className="ledgerAddBtn" onClick={addBucket}>+ Add</button>
            <button className="ledgerCollapseBtn" onClick={() => toggleCollapse('family')}>{collapse.family ? '▸' : '▾'}</button>
          </div>
        </div>
        {!collapse.family && (
          <div className="ledgerGrid">
            {pipeline.bucketResults.map((b, i) => {
              const fillColor = FAMILY_THEME_FILL_COLORS[i % FAMILY_THEME_FILL_COLORS.length]
              const fillPct = b.target > 0 ? Math.min(100, (b.filled / b.target) * 100) : (b.fullyFunded ? 100 : 0)
              return (
                <div key={b.name} className={`ledgerCard theme-${(i % 6) + 2}`} style={{ position: 'relative', height: 'auto', minHeight: 104, padding: '12px 6px 10px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${fillPct}%`, background: fillColor, opacity: 0.3, transition: 'height 0.3s ease', zIndex: 0 }} />
                  <div style={{ position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800, color: '#6b7280', background: 'rgba(255,255,255,0.7)', borderRadius: 7, padding: '1px 5px', zIndex: 2 }}>#{i + 1}</div>
                  <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 1, zIndex: 2 }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); swapBucketPriority(b.name, -1) }} style={{ border: 'none', background: 'rgba(255,255,255,0.7)', borderRadius: 5, width: 17, height: 17, fontSize: 9, lineHeight: '17px' }}>▲</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); swapBucketPriority(b.name, 1) }} style={{ border: 'none', background: 'rgba(255,255,255,0.7)', borderRadius: 5, width: 17, height: 17, fontSize: 9, lineHeight: '17px' }}>▼</button>
                  </div>
                  <div onClick={() => setSelectedCategory({ type: 'allocation', name: b.name, theme: `theme-${(i % 6) + 2}` })} style={{ position: 'relative', zIndex: 1, marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div className="ledgerCardTitle" style={{ height: 'auto', minHeight: 30, fontSize: 11 }}>{b.name}</div>
                    <div className="ledgerCardValue" style={{ fontSize: 11, marginTop: 6 }}>{fmtTZS(b.filled)}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>of {fmtTZS(b.target)}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, color: b.fullyFunded ? '#15803d' : b.filled > 0 ? '#b45309' : '#94a3b8' }}>
                      {b.fullyFunded ? 'FUNDED' : b.filled > 0 ? 'PARTIAL' : 'UNFUNDED'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={`ledgerSummaryCard ${pipeline.growthSurplus < 0 ? 'neg' : 'pos'}`}>
        <div className="ledgerSummaryBalanceRow" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <span className="ledgerSummaryBalanceLabel">Surplus</span>
          <span className="ledgerSummaryBalanceValue">{fmtTZS(pipeline.growthSurplus)}</span>
        </div>
      </div>

      {/* 5. Growth */}
      <div className="ledgerSection">
        <div className="ledgerSectionHead">
          <div className="ledgerSectionTitle">Growth <span className="ledgerSectionTotal">{fmtTZS(pipeline.growthSurplus)}</span></div>
          <div className="ledgerSectionActions">
            <button className="ledgerCollapseBtn" onClick={() => toggleCollapse('growth')}>{collapse.growth ? '▸' : '▾'}</button>
          </div>
        </div>
        {!collapse.growth && (
          <>
            <div className="ledgerGrid">
              {pipeline.growthResults.map((p, i) => (
                <div key={p.id} className={`ledgerCard theme-${(i % 6) + 4}`} onClick={() => editGrowthPercent(p.id)}>
                  <div className="ledgerCardTitle">{p.name}</div>
                  <div className="ledgerCardIcon">{p.percent}%</div>
                  <div className="ledgerCardValue">{fmtTZS(p.amount)}</div>
                </div>
              ))}
            </div>
            {pipeline.growthPercentTotal !== 100 && (
              <div style={{ padding: '0 12px 12px', fontSize: 11, color: '#b45309' }}>
                Unallocated: {(100 - pipeline.growthPercentTotal).toFixed(0)}% — pool percentages don't sum to 100.
              </div>
            )}
            {!pipeline.allBucketsFunded && (
              <div style={{ padding: '0 12px 12px', fontSize: 11, color: '#8b90b2' }}>
                Growth stays at 0 until all Family Happiness buckets are fully funded.
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
