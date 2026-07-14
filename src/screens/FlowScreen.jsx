import React, { useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS } from '../money'
import { computeIncome } from '../utils/pipeline'
import { computeEnvelopeSummary } from '../utils/envelopes'
import { withGrowthPercentForMonth, getGrowthPercentForMonth } from '../utils/ledger'

const UPKEEP_COLOR = '#fb923c'
const LIFESTYLE_PALETTE = ['#a87dfb', '#38bdf8', '#f472b6', '#fbbf24', '#818cf8', '#fb7185']
const GROWTH_PALETTE = ['#2bb06a', '#22c55e', '#34d399', '#10b981', '#4ade80', '#059669']

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

function FlowRow({ name, sub, amount, tag, tagColor, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', borderRadius: 16, background: `${color}0f`, border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, cursor: onClick ? 'pointer' : 'default'
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
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtTZS(amount)}</div>
        {tag && <div style={{ fontSize: 11, fontWeight: 700, color: tagColor || '#94a3b8' }}>{tag}</div>}
      </div>
      {onClick && <div style={{ fontSize: 13, color: '#94a3b8', marginLeft: 4, flexShrink: 0 }}>✎</div>}
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

// Read-only budget report: for each category (Upkeep lump, Lifestyle buckets, Growth
// pools), shows how much was Distributed this period and the running Balance
// (Distributed minus real spend, carried over month to month). No transaction entry
// happens here — Distribution happens in Accounts, Expenditure in Transactions.
export function FlowScreen() {
  const {
    formatMonthLabel,
    activeLedger, setShowLedgerPicker, persistActiveLedger, show
  } = useAppContext()

  // Budget/percent aren't transactions — they're just category settings — so
  // editing them here (unlike adding a transaction) doesn't break Flow's
  // read-only-report rule.
  const [editTarget, setEditTarget] = useState(null) // { metaType: 'allocation'|'growth', name, field: 'budget'|'percent' }
  const [editValue, setEditValue] = useState('')

  const openEdit = (metaType, name, field, currentValue) => {
    setEditTarget({ metaType, name, field })
    setEditValue(String(currentValue || 0))
  }

  const saveEdit = () => {
    const { metaType, name, field } = editTarget
    const nextValue = Number(String(editValue).replace(/,/g, '')) || 0
    if (metaType === 'growth' && field === 'percent' && growthOverBy > 0) {
      show(`Growth pools would total ${projectedGrowthTotal}% — reduce this or another pool below 100% first.`)
      return
    }
    const existingMeta = activeLedger.categoryMeta[metaType]?.[name]
    // Growth percent is month-scoped: it takes effect from the viewed period
    // forward without rewriting earlier months' percentages.
    const nextMeta = metaType === 'growth' && field === 'percent'
      ? withGrowthPercentForMonth(existingMeta, growthPercentMonthKey, nextValue)
      : { ...existingMeta, [field]: nextValue }
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
  const growthPercentMonthKey = viewGranularity === 'year' ? `${statPeriod}-01` : statPeriod
  const isEditingGrowthPercent = editTarget?.metaType === 'growth' && editTarget?.field === 'percent'
  const otherGrowthPercentTotal = isEditingGrowthPercent
    ? (activeLedger.categories.growth || [])
      .filter(n => n !== editTarget.name)
      .reduce((s, n) => s + getGrowthPercentForMonth(activeLedger.categoryMeta.growth?.[n], growthPercentMonthKey), 0)
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

  const lifestyleDistributed = envelopeSummary.lifestyle.reduce((s, b) => s + b.distributedThisPeriod, 0)
  const growthDistributed = envelopeSummary.growth.reduce((s, p) => s + p.distributedThisPeriod, 0)
    + envelopeSummary.growthUnallocated.distributedThisPeriod
  // Higher-percent pools carry more priority, so they surface first.
  const growthSorted = useMemo(
    () => [...envelopeSummary.growth].sort((a, b) => b.percent - a.percent),
    [envelopeSummary]
  )
  const totalDistributed = envelopeSummary.upkeep.distributedThisPeriod + lifestyleDistributed + growthDistributed

  const ringSegments = [
    { name: 'Upkeep', value: envelopeSummary.upkeep.distributedThisPeriod, color: UPKEEP_COLOR },
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
        <RingLegendItem color={UPKEEP_COLOR} label="Upkeep" percent={percentOf(envelopeSummary.upkeep.distributedThisPeriod)} />
        <RingLegendItem color={LIFESTYLE_PALETTE[0]} label="Lifestyle" percent={percentOf(lifestyleDistributed)} />
        <RingLegendItem color={GROWTH_PALETTE[0]} label="Growth" percent={percentOf(growthDistributed)} />
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
          amount={envelopeSummary.upkeep.distributedThisPeriod}
          tag={`Balance: ${fmtTZS(envelopeSummary.upkeep.balance)}`}
          color={UPKEEP_COLOR}
        />

        <SectionDivider title="LIFESTYLE" total={lifestyleDistributed} color={LIFESTYLE_PALETTE[0]} />
        {envelopeSummary.lifestyle.map((b, i) => (
          <FlowRow
            key={b.name}
            name={b.name}
            sub={`B/F: ${fmtTZS(b.broughtForward)}`}
            amount={b.distributedThisPeriod}
            tag={`Balance: ${fmtTZS(b.balance)}`}
            color={LIFESTYLE_PALETTE[i % LIFESTYLE_PALETTE.length]}
            onClick={() => openEdit('allocation', b.name, 'budget', b.budget)}
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
            amount={p.distributedThisPeriod}
            tag={`Balance: ${fmtTZS(p.balance)}`}
            color={GROWTH_PALETTE[i % GROWTH_PALETTE.length]}
            onClick={() => openEdit('growth', p.name, 'percent', p.percent)}
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
      </div>

      {editTarget && (
        <div className="modalBackdrop" onClick={() => setEditTarget(null)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">{editTarget.name}</div>
            <div className="field">
              <label>{editTarget.field === 'percent' ? 'Target % of Surplus' : 'Monthly Target (TZS)'}</label>
              <input inputMode="decimal" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder={editTarget.field === 'percent' ? 'e.g. 30' : 'e.g. 100000'} autoFocus />
              {editTarget.field === 'percent' && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  Applies from {periodLabel} onward — earlier months keep their existing %.
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
            <div className="modalActions">
              <button className="btn" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit} disabled={growthOverBy > 0}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
