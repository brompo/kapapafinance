import React, { useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, todayISO } from '../money'
import { computeIncome } from '../utils/pipeline'
import { computeEnvelopeSummary } from '../utils/envelopes'
import { withGrowthPercentForMonth, getGrowthPercentForMonth, withBudgetForMonth } from '../utils/ledger'

// Theme bases mirror the category-card colors HomeScreen assigns per section
// (Transactions tab), so a category opened from Flow gets the same header
// color as it would opening the same category from Transactions.
const THEME_BASE = { expense: 1, allocation: 2, collection: 4, growth: 4 }

// A new transaction started from a Flow row defaults to the period Flow is
// viewing, not necessarily today — browsing March's report and tapping
// "spend" should log into March. Year view has no month to anchor to, so it
// only carries the current-year/today link; a past year falls back to
// December of that year, same clamped-day rule as month view.
function defaultTxnDateForPeriod(viewGranularity, statPeriod) {
  const today = new Date()
  const clampedDay = (year, month) => Math.min(today.getDate(), new Date(year, month, 0).getDate())
  if (viewGranularity === 'year') {
    if (String(statPeriod) === String(today.getFullYear())) return todayISO()
    const day = clampedDay(Number(statPeriod), 12)
    return `${statPeriod}-12-${String(day).padStart(2, '0')}`
  }
  const [y, m] = statPeriod.split('-').map(Number)
  const day = clampedDay(y, m)
  return `${statPeriod}-${String(day).padStart(2, '0')}`
}

const UPKEEP_COLOR = '#fb923c'
const LIFESTYLE_PALETTE = ['#a87dfb', '#38bdf8', '#f472b6', '#fbbf24', '#818cf8', '#fb7185']
const GROWTH_PALETTE = ['#2bb06a', '#22c55e', '#34d399', '#10b981', '#4ade80', '#059669']
const BALANCE_COLOR = '#0ea5e9'

// Pie split into one solid wedge per segment (Upkeep / Lifestyle / Growth), sized by
// each segment's share of this period's total Distributed amount. Each wedge carries
// its own % label, skipped when a slice is too thin to hold text.
function SegmentedPie({ segments, size = 132 }) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  let cumulative = 0
  const layout = segments
    .map(seg => ({ ...seg, value: Math.max(0, seg.value) }))
    .filter(seg => seg.value > 0)
    .map(seg => {
      const fraction = total > 0 ? seg.value / total : 0
      const startFraction = total > 0 ? cumulative / total : 0
      cumulative += seg.value
      return { ...seg, fraction, startFraction }
    })

  const pointAt = (fraction, radius) => {
    const deg = -90 + fraction * 360
    const rad = (deg * Math.PI) / 180
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {layout.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={layout[0].color} />
        ) : layout.map(seg => {
          const [x1, y1] = pointAt(seg.startFraction, r)
          const [x2, y2] = pointAt(seg.startFraction + seg.fraction, r)
          const largeArc = seg.fraction > 0.5 ? 1 : 0
          return (
            <path
              key={seg.name}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={seg.color}
              stroke="#fff"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
      {layout.filter(seg => seg.fraction >= 0.06).map(seg => {
        const [x, y] = pointAt(seg.startFraction + seg.fraction / 2, r * 0.62)
        return (
          <div
            key={seg.name}
            style={{
              position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)',
              fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)', pointerEvents: 'none'
            }}
          >
            {Math.round(seg.fraction * 100)}%
          </div>
        )
      })}
    </div>
  )
}

function RingLegendItem({ color, label, percent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>{percent.toFixed(0)}%</span>
    </div>
  )
}

// onSpend (tap the row) opens transaction entry for this category; onEdit
// (the separate ✎ button) opens the target/%/opening-balance modal. They're
// deliberately different hit-targets on the same row rather than one click
// doing both, since "log a spend" and "change my target" are different jobs
// a person reaches for at different times.
function FlowRow({ name, sub, expense, note, amount, preTag, tag, tagColor, color, onSpend, onEdit }) {
  return (
    <div
      onClick={onSpend}
      style={{
        padding: '10px 12px', borderRadius: 16, background: `${color}0f`, border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, cursor: onSpend ? 'pointer' : 'default'
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 18, background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0
      }}>
        {(name || '').slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {expense > 0 && <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 400 }}>Expense: {fmtTZS(expense)}</div>}
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtTZS(amount)}</div>
        {note && <div style={{ fontSize: 11, fontWeight: 500, color: '#16a34a' }}>{note}</div>}
        {preTag && <div style={{ fontSize: 11, fontWeight: 500, color: '#16a34a' }}>{preTag}</div>}
        {tag && <div style={{ fontSize: 11, fontWeight: 700, color: tagColor || '#94a3b8' }}>{tag}</div>}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onEdit() }}
          style={{ fontSize: 13, color: '#94a3b8', marginLeft: 4, flexShrink: 0, background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
          aria-label={`Edit ${name}`}
        >✎</button>
      )}
      {onSpend && !onEdit && <div style={{ fontSize: 15, color: '#94a3b8', marginLeft: 4, flexShrink: 0 }}>›</div>}
    </div>
  )
}

function CategoryPickList({ names, onPick }) {
  if (names.length === 0) {
    return <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No categories yet — add one from Transactions first.</div>
  }
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
      {names.map(name => (
        <button
          key={name}
          type="button"
          onClick={() => onPick(name)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '12px 10px',
            border: 'none', borderBottom: '1px solid #f1f5f9', background: 'none',
            fontSize: 14, fontWeight: 600, color: '#1e293b', cursor: 'pointer'
          }}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function SectionDivider({ title, total, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 4px 10px' }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: 0.3 }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{fmtTZS(total)}</div>
    </div>
  )
}

// Budget report + primary spend/income entry point for pipeline mode: for each
// category (Upkeep lump, Lifestyle buckets, Growth pools) shows how much was
// Distributed this period and the running Balance (Distributed minus real
// spend, carried over month to month) — and tapping a row opens the same
// transaction-entry screen Transactions uses (reached via Settings for this
// mode), landing back here once you're done. Editing a target/%/opening
// balance is a separate action (the ✎ button), not a transaction.
export function FlowScreen() {
  const {
    formatMonthLabel,
    activeLedger, setShowLedgerPicker, persistActiveLedger, show, setSelectedCategory
  } = useAppContext()

  // Budget/percent aren't transactions — they're just category settings — so
  // editing them here doesn't go through the same flow as adding a transaction.
  const [editTarget, setEditTarget] = useState(null) // { metaType: 'allocation'|'growth', name, field: 'budget'|'percent' }
  const [editValue, setEditValue] = useState('')
  const [editOpeningBalance, setEditOpeningBalance] = useState('')

  // Transfer moves Balance between Lifestyle buckets and Growth pools by shifting
  // their openingBalance — the only term in each one's balance formula that isn't
  // derived from the cascade, so this is a pure move with no effect on other months.
  // Upkeep has no openingBalance term (its balance is cascade + funded-by-growth minus
  // spend only), so it can't participate as a transfer endpoint.
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferFrom, setTransferFrom] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')

  // Upkeep has no single category to spend against (it's every Expense
  // category lumped together), and Collections has no rows on this screen at
  // all — both need a quick "which category?" picker before landing on the
  // real transaction-entry screen. Lifestyle/Growth rows skip this since they
  // already map 1:1 to a category.
  const [showUpkeepPicker, setShowUpkeepPicker] = useState(false)
  const [showIncomePicker, setShowIncomePicker] = useState(false)

  // Opens the same transaction-entry screen Transactions uses, pre-dated to
  // whatever period Flow is currently viewing (see defaultTxnDateForPeriod)
  // rather than always defaulting to today.
  const openCategorySpend = (type, name) => {
    const listKey = type === 'collection' ? 'income' : type
    const list = activeLedger.categories?.[listKey] || []
    const i = Math.max(0, list.indexOf(name))
    setSelectedCategory({
      type,
      name,
      theme: `theme-${(i % 6) + THEME_BASE[type]}`,
      initialDate: defaultTxnDateForPeriod(viewGranularity, statPeriod)
    })
  }

  const openEdit = (metaType, name, field, currentValue) => {
    setEditTarget({ metaType, name, field })
    setEditValue(String(currentValue || 0))
    setEditOpeningBalance(String(activeLedger.categoryMeta[metaType]?.[name]?.openingBalance || 0))
  }

  const saveEdit = () => {
    const { metaType, name, field } = editTarget
    const nextValue = Number(String(editValue).replace(/,/g, '')) || 0
    if (metaType === 'growth' && field === 'percent' && growthOverBy > 0) {
      show(`Growth pools would total ${projectedGrowthTotal}% — reduce this or another pool below 100% first.`)
      return
    }
    const existingMeta = activeLedger.categoryMeta[metaType]?.[name]
    // Growth percent and Lifestyle budget are both month-scoped: an edit takes
    // effect from the viewed period forward without rewriting earlier months.
    const nextMeta = {
      ...(metaType === 'growth' && field === 'percent'
        ? withGrowthPercentForMonth(existingMeta, editMonthKey, nextValue)
        : metaType === 'allocation' && field === 'budget'
          ? withBudgetForMonth(existingMeta, editMonthKey, nextValue)
          : { ...existingMeta, [field]: nextValue }),
      openingBalance: Number(String(editOpeningBalance).replace(/,/g, '')) || 0
    }
    persistActiveLedger({
      ...activeLedger,
      categoryMeta: {
        ...activeLedger.categoryMeta,
        [metaType]: {
          ...activeLedger.categoryMeta[metaType],
          [name]: nextMeta
        }
      }
    })
    show('Updated.')
    setEditTarget(null)
  }

  // Own period state, independent of the global month (same pattern Insights
  // uses) — Year and Month only, since the underlying cascade is computed per
  // calendar month and a weekly view wouldn't have anything meaningful to show.
  const [viewGranularity, setViewGranularity] = useState('month')
  const [statPeriod, setStatPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [showGranularityMenu, setShowGranularityMenu] = useState(false)

  const shiftPeriod = (delta) => {
    if (viewGranularity === 'year') {
      setStatPeriod(String(Number(statPeriod) + delta))
    } else {
      const d = new Date(statPeriod + '-01')
      d.setMonth(d.getMonth() + delta)
      setStatPeriod(d.toISOString().slice(0, 7))
    }
  }

  const periodLabel = viewGranularity === 'year' ? statPeriod : formatMonthLabel(statPeriod)

  // Growth percentages should sum to 100% for the month being edited — this
  // computes what the other pools already claim so Save can warn/block before
  // a pool pushes the total over.
  const editMonthKey = viewGranularity === 'year' ? `${statPeriod}-01` : statPeriod
  const isEditingGrowthPercent = editTarget?.metaType === 'growth' && editTarget?.field === 'percent'
  const otherGrowthPercentTotal = isEditingGrowthPercent
    ? (activeLedger.categories.growth || [])
      .filter(n => n !== editTarget.name)
      .reduce((s, n) => s + getGrowthPercentForMonth(activeLedger.categoryMeta.growth?.[n], editMonthKey), 0)
    : 0
  const enteredGrowthPercent = Number(String(editValue).replace(/,/g, '')) || 0
  const projectedGrowthTotal = otherGrowthPercentTotal + enteredGrowthPercent
  const growthOverBy = isEditingGrowthPercent ? projectedGrowthTotal - 100 : 0

  const periodTxns = useMemo(
    () => (activeLedger?.txns || []).filter(t => t.date && t.date.slice(0, statPeriod.length) === statPeriod),
    [activeLedger, statPeriod]
  )
  const incomeInfo = useMemo(() => computeIncome(periodTxns), [periodTxns])
  const envelopeSummary = useMemo(() => computeEnvelopeSummary(activeLedger, statPeriod), [activeLedger, statPeriod])

  const transferBuckets = useMemo(() => [
    ...envelopeSummary.lifestyle.map(b => ({ type: 'allocation', name: b.name, balance: b.balance })),
    ...envelopeSummary.growth.map(p => ({ type: 'growth', name: p.name, balance: p.balance }))
  ], [envelopeSummary])

  const openTransfer = () => {
    if (transferBuckets.length < 2) return show('Need at least two Lifestyle/Growth buckets to transfer between.')
    setTransferFrom(`${transferBuckets[0].type}::${transferBuckets[0].name}`)
    setTransferTo(`${transferBuckets[1].type}::${transferBuckets[1].name}`)
    setTransferAmount('')
    setShowTransferModal(true)
  }

  const transferFromBucket = transferBuckets.find(b => `${b.type}::${b.name}` === transferFrom)
  const enteredTransferAmount = Number(String(transferAmount).replace(/,/g, '')) || 0
  const transferExceedsBalance = !!transferFromBucket && enteredTransferAmount > transferFromBucket.balance

  const saveTransfer = () => {
    const amt = enteredTransferAmount
    if (!amt || amt <= 0) return show('Enter a valid amount.')
    if (!transferFrom || !transferTo || transferFrom === transferTo) return show('Choose two different buckets.')
    const [fromType, fromName] = transferFrom.split('::')
    const [toType, toName] = transferTo.split('::')
    const fromMeta = activeLedger.categoryMeta[fromType]?.[fromName] || {}
    const toMeta = activeLedger.categoryMeta[toType]?.[toName] || {}
    const nextCategoryMeta = { ...activeLedger.categoryMeta }
    nextCategoryMeta[fromType] = {
      ...nextCategoryMeta[fromType],
      [fromName]: { ...fromMeta, openingBalance: Number(fromMeta.openingBalance || 0) - amt }
    }
    nextCategoryMeta[toType] = {
      ...nextCategoryMeta[toType],
      [toName]: { ...(nextCategoryMeta[toType]?.[toName] || toMeta), openingBalance: Number(toMeta.openingBalance || 0) + amt }
    }
    persistActiveLedger({ ...activeLedger, categoryMeta: nextCategoryMeta })
    show(`Moved ${fmtTZS(amt)}.`)
    setShowTransferModal(false)
    setTransferAmount('')
  }

  const lifestyleDistributed = envelopeSummary.lifestyle.reduce((s, b) => s + b.distributedThisPeriod, 0)
  const growthDistributed = envelopeSummary.growth.reduce((s, p) => s + p.distributedThisPeriod, 0)
    + envelopeSummary.growthUnallocated.distributedThisPeriod
  const fundsUpkeepPoolName = envelopeSummary.growth.find(p => p.fundsUpkeep)?.name
  // Higher-percent pools carry more priority, so they surface first.
  const growthSorted = useMemo(
    () => [...envelopeSummary.growth].sort((a, b) => b.percent - a.percent),
    [envelopeSummary]
  )
  // Upkeep's own displayed "Distribution" line stays budget-only (see FlowRow
  // below), but the pie/headline total still needs to account for every
  // shilling actually distributed this period, including what a fundsUpkeep
  // pool redirected in.
  const upkeepDistributedTotal = envelopeSummary.upkeep.distributedThisPeriod + envelopeSummary.upkeep.fundedByGrowthThisPeriod
  const totalDistributed = upkeepDistributedTotal + lifestyleDistributed + growthDistributed

  // The Balance summary rolls up every bucket except Upkeep itself. A Growth
  // pool flagged fundsUpkeep (e.g. "Up Buffer") is excluded here too — its
  // share never accumulates its own Balance (see envelopes.js), it's already
  // folded into Upkeep's Balance above, so counting it here would double it.
  const nonUpkeepGrowth = envelopeSummary.growth.filter(p => !p.fundsUpkeep)
  const balanceBF = envelopeSummary.lifestyle.reduce((s, b) => s + b.broughtForward, 0)
    + nonUpkeepGrowth.reduce((s, p) => s + p.broughtForward, 0)
    + envelopeSummary.growthUnallocated.broughtForward
  const balanceExpense = envelopeSummary.lifestyle.reduce((s, b) => s + b.spentThisPeriod, 0)
    + nonUpkeepGrowth.reduce((s, p) => s + p.spentThisPeriod, 0)
  // What was left over carrying in, net of this period's spend, before this
  // period's Distribution is added on top to arrive at the new Balance.
  const balanceBeforeDistribution = balanceBF - balanceExpense
  // lifestyleDistributed/growthDistributed already exclude the fundsUpkeep
  // pool's share (its cascade share is redirected to Upkeep, never counted as
  // its own Distribution — see cascadeForMonth in envelopes.js), so this is
  // already "Distribution from Lifestyle and Growth except what's going to Upkeep."
  const balanceDistribution = lifestyleDistributed + growthDistributed
  const balanceTotal = envelopeSummary.lifestyle.reduce((s, b) => s + b.balance, 0)
    + nonUpkeepGrowth.reduce((s, p) => s + p.balance, 0)
    + envelopeSummary.growthUnallocated.balance

  const ringSegments = [
    { name: 'Upkeep', value: upkeepDistributedTotal, color: UPKEEP_COLOR },
    { name: 'Lifestyle', value: lifestyleDistributed, color: LIFESTYLE_PALETTE[0] },
    { name: 'Growth', value: growthDistributed, color: GROWTH_PALETTE[0] }
  ]
  const ringTotal = ringSegments.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  const percentOf = (v) => ringTotal > 0 ? (Math.max(0, v) / ringTotal) * 100 : 0

  return (
    <div className="ledgerScreen">
      <div className="ledgerHeader">
        <button className="ledgerGhost" onClick={() => setShowLedgerPicker(true)}>{activeLedger.name || 'Personal'} ▾</button>
        <div className="ledgerPeriod" style={{ position: 'relative' }}>
          <button className="ledgerNavBtn" onClick={() => shiftPeriod(-1)}>‹</button>
          <div className="ledgerPeriodLabel" style={{ cursor: 'pointer' }} onClick={() => setShowGranularityMenu(v => !v)}>{periodLabel}</div>
          <button className="ledgerNavBtn" onClick={() => shiftPeriod(1)}>›</button>

          {showGranularityMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowGranularityMenu(false)} />
              <div style={{
                position: 'absolute', top: 35, left: '50%', transform: 'translateX(-50%)',
                background: '#fff', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                padding: 8, zIndex: 101, minWidth: 120, border: '1px solid #f1f5f9'
              }}>
                {['Year', 'Month'].map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      const low = g.toLowerCase()
                      setViewGranularity(low)
                      setShowGranularityMenu(false)
                      const now = new Date()
                      setStatPeriod(low === 'year' ? String(now.getFullYear()) : now.toISOString().slice(0, 7))
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
        <div style={{ width: 40 }} />
      </div>

      <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#111827' }}>{fmtTZS(totalDistributed)}</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Distributed this {viewGranularity}</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Income this {viewGranularity}: {fmtTZS(incomeInfo.income)}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 14px' }}>
        <SegmentedPie segments={ringSegments} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, padding: '0 16px 8px' }}>
        <RingLegendItem color={UPKEEP_COLOR} label="Upkeep" percent={percentOf(upkeepDistributedTotal)} />
        <RingLegendItem color={LIFESTYLE_PALETTE[0]} label="Lifestyle" percent={percentOf(lifestyleDistributed)} />
        <RingLegendItem color={GROWTH_PALETTE[0]} label="Growth" percent={percentOf(growthDistributed)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 16px 10px' }}>
        <button className="miniBtn" type="button" onClick={() => setShowIncomePicker(true)}>+ Add Income</button>
      </div>

      {incomeInfo.isLegacyFallback && (
        <div style={{ padding: '4px 16px 0', fontSize: 11, color: '#8b90b2' }}>
          No Collections recorded yet this {viewGranularity} — Income includes legacy entries shown as already-clean.
        </div>
      )}

      <div style={{ padding: '10px 16px 40px' }}>
        <SectionDivider title="UPKEEP" total={envelopeSummary.upkeep.distributedThisPeriod} color={UPKEEP_COLOR} />
        <FlowRow
          name="Upkeep"
          sub={`B/F: ${fmtTZS(envelopeSummary.upkeep.broughtForward)}`}
          expense={envelopeSummary.upkeep.spentThisPeriod}
          note={envelopeSummary.upkeep.fundedByGrowthThisPeriod > 0
            ? `${fundsUpkeepPoolName || 'Growth'}: ${fmtTZS(envelopeSummary.upkeep.fundedByGrowthThisPeriod)}`
            : null}
          amount={envelopeSummary.upkeep.distributedThisPeriod}
          tag={`Balance: ${fmtTZS(envelopeSummary.upkeep.balance)}`}
          color={UPKEEP_COLOR}
          onSpend={() => setShowUpkeepPicker(true)}
        />

        <SectionDivider title="LIFESTYLE" total={lifestyleDistributed} color={LIFESTYLE_PALETTE[0]} />
        {envelopeSummary.lifestyle.map((b, i) => (
          <FlowRow
            key={b.name}
            name={b.name}
            sub={`B/F: ${fmtTZS(b.broughtForward)}`}
            expense={b.spentThisPeriod}
            amount={b.distributedThisPeriod}
            tag={`Balance: ${fmtTZS(b.balance)}`}
            color={LIFESTYLE_PALETTE[i % LIFESTYLE_PALETTE.length]}
            onSpend={() => openCategorySpend('allocation', b.name)}
            onEdit={() => openEdit('allocation', b.name, 'budget', b.budget)}
          />
        ))}
        {envelopeSummary.lifestyle.length === 0 && (
          <div style={{ padding: '4px 12px 12px', fontSize: 11, color: '#8b90b2' }}>No Lifestyle buckets yet.</div>
        )}

        <SectionDivider title="GROWTH" total={growthDistributed} color={GROWTH_PALETTE[0]} />
        {growthSorted.map((p, i) => (
          <FlowRow
            key={p.name}
            name={`${p.name} (${p.percent}%)`}
            sub={`B/F: ${fmtTZS(p.broughtForward)}`}
            expense={p.spentThisPeriod}
            amount={p.fundsUpkeep ? p.redirectedToUpkeepThisPeriod : p.distributedThisPeriod}
            tag={p.fundsUpkeep ? '→ Funds Upkeep' : `Balance: ${fmtTZS(p.balance)}`}
            color={p.fundsUpkeep ? '#94a3b8' : GROWTH_PALETTE[i % GROWTH_PALETTE.length]}
            onSpend={() => openCategorySpend('growth', p.name)}
            onEdit={() => openEdit('growth', p.name, 'percent', p.percent)}
          />
        ))}
        {envelopeSummary.growth.length === 0 && (
          <div style={{ padding: '4px 12px 12px', fontSize: 11, color: '#8b90b2' }}>No Growth pools yet.</div>
        )}
        {Math.round(envelopeSummary.growthUnallocated.percent) > 0 && (
          <FlowRow
            name={`Unallocated (${Math.round(envelopeSummary.growthUnallocated.percent)}%)`}
            sub={`B/F: ${fmtTZS(envelopeSummary.growthUnallocated.broughtForward)}`}
            amount={envelopeSummary.growthUnallocated.distributedThisPeriod}
            tag={`Balance: ${fmtTZS(envelopeSummary.growthUnallocated.balance)}`}
            color="#94a3b8"
          />
        )}

        <SectionDivider title="BALANCE" total={balanceDistribution} color={BALANCE_COLOR} />
        <FlowRow
          name="Lifestyle + Growth"
          sub={`B/F: ${fmtTZS(balanceBF)}`}
          expense={balanceExpense}
          amount={balanceDistribution}
          preTag={`Before Distribution: ${fmtTZS(balanceBeforeDistribution)}`}
          tag={`Balance: ${fmtTZS(balanceTotal)}`}
          color={BALANCE_COLOR}
        />

        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 16px 0' }}>
          <button className="miniBtn" type="button" onClick={openTransfer}>⇄ Transfer Between Buckets</button>
        </div>
      </div>

      {editTarget && (
        <div className="modalBackdrop" onClick={() => setEditTarget(null)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">{editTarget.name}</div>
            <div className="field">
              <label>{editTarget.field === 'percent' ? 'Target % of Surplus' : 'Monthly Target (TZS)'}</label>
              <input inputMode="decimal" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder={editTarget.field === 'percent' ? 'e.g. 30' : 'e.g. 100000'} autoFocus />
              {(editTarget.field === 'percent' || editTarget.field === 'budget') && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  Applies from {periodLabel} onward — earlier months keep their existing {editTarget.field === 'percent' ? '%' : 'target'}.
                </div>
              )}
              {isEditingGrowthPercent && (
                <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, color: growthOverBy > 0 ? '#ef4444' : '#94a3b8' }}>
                  {growthOverBy > 0
                    ? `Growth pools would total ${projectedGrowthTotal}% — ${growthOverBy}% over 100%.`
                    : projectedGrowthTotal < 100
                      ? `Growth pools would total ${projectedGrowthTotal}% — ${100 - projectedGrowthTotal}% left unallocated.`
                      : 'Growth pools total 100%.'}
                </div>
              )}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Opening Balance (TZS)</label>
              <input inputMode="decimal" value={editOpeningBalance} onChange={e => setEditOpeningBalance(e.target.value)} placeholder="e.g. 0" />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                One-time top-up added straight into Balance, for money this bucket already held before you started tracking it here.
              </div>
            </div>
            <div className="modalActions">
              <button className="btn" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit} disabled={growthOverBy > 0}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="modalBackdrop" onClick={() => setShowTransferModal(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Transfer Between Buckets</div>
            <div className="field">
              <label>From</label>
              <select value={transferFrom} onChange={e => setTransferFrom(e.target.value)}>
                {transferBuckets.map(b => (
                  <option key={`from-${b.type}::${b.name}`} value={`${b.type}::${b.name}`}>
                    {b.name} — Balance: {fmtTZS(b.balance)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>To</label>
              <select value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                {transferBuckets.map(b => (
                  <option key={`to-${b.type}::${b.name}`} value={`${b.type}::${b.name}`}>
                    {b.name} — Balance: {fmtTZS(b.balance)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Amount (TZS)</label>
              <input inputMode="decimal" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="e.g. 100000" autoFocus />
              {transferExceedsBalance && (
                <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, color: '#ef4444' }}>
                  {transferFromBucket.name} only has {fmtTZS(transferFromBucket.balance)} — this will push it negative.
                </div>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                Upkeep can't be a transfer endpoint — its Balance is fixed spend-vs-distributed and holds no movable top-up.
              </div>
            </div>
            <div className="modalActions">
              <button className="btn" type="button" onClick={() => setShowTransferModal(false)}>Cancel</button>
              <button className="btn primary" type="button" onClick={saveTransfer}>Move</button>
            </div>
          </div>
        </div>
      )}

      {showUpkeepPicker && (
        <div className="modalBackdrop" onClick={() => setShowUpkeepPicker(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Spend from Upkeep</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
              Upkeep covers every Expense category — pick which one this spend is for.
            </div>
            <CategoryPickList
              names={activeLedger.categories?.expense || []}
              onPick={name => { setShowUpkeepPicker(false); openCategorySpend('expense', name) }}
            />
            <div className="modalActions">
              <button className="btn" type="button" onClick={() => setShowUpkeepPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showIncomePicker && (
        <div className="modalBackdrop" onClick={() => setShowIncomePicker(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Add Income</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
              Pick which Collection this income belongs to.
            </div>
            <CategoryPickList
              names={activeLedger.categories?.income || []}
              onPick={name => { setShowIncomePicker(false); openCategorySpend('collection', name) }}
            />
            <div className="modalActions">
              <button className="btn" type="button" onClick={() => setShowIncomePicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
