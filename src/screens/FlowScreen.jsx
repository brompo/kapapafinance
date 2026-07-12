import React, { useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS } from '../money'
import { computePipeline } from '../utils/pipeline'

const UPKEEP_COLOR = '#fb923c'
const LIFESTYLE_PALETTE = ['#a87dfb', '#38bdf8', '#f472b6', '#fbbf24', '#818cf8', '#fb7185']
const GROWTH_PALETTE = ['#2bb06a', '#22c55e', '#34d399', '#10b981', '#4ade80', '#059669']

// Pie split into one solid wedge per segment (Upkeep / Lifestyle / Growth), sized by
// each segment's share of Income — the three always sum to a full circle since every
// shilling of Income lands in exactly one of the three (see computePipeline). Each
// wedge carries its own % label, skipped when a slice is too thin to hold text.
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

function FlowRow({ name, sub, amount, tag, tagColor, color }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 16, background: `${color}0f`, border: `1px solid ${color}33`,
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8
    }}>
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

// Simple read-only budget plan: Income cascades through Upkeep -> Lifestyle -> Growth,
// each segment showing its Budget vs how much of Income was Allocated to it. No
// transaction entry happens here — that lives in the Transactions tab.
export function FlowScreen() {
  const {
    month, shiftMonth, formatMonthLabel,
    activeLedger, filteredTxns, setShowLedgerPicker
  } = useAppContext()

  const monthLabel = useMemo(() => formatMonthLabel(month), [month, formatMonthLabel])
  const pipeline = useMemo(() => computePipeline(filteredTxns, activeLedger, month), [filteredTxns, activeLedger, month])

  const coreTarget = pipeline.upkeepTarget + pipeline.lifestyleTargetTotal
  const coreAllocated = pipeline.upkeepAllocated + pipeline.lifestyleAllocatedTotal
  const remaining = Math.max(0, coreTarget - coreAllocated)

  // Upkeep + Lifestyle + Growth always add up to Income exactly, so these three
  // shares always fill the ring completely.
  const ringSegments = [
    { name: 'Upkeep', value: pipeline.upkeepAllocated, color: UPKEEP_COLOR },
    { name: 'Lifestyle', value: pipeline.lifestyleAllocatedTotal, color: LIFESTYLE_PALETTE[0] },
    { name: 'Growth', value: pipeline.growthPoolAmount, color: GROWTH_PALETTE[0] }
  ]
  const ringTotal = ringSegments.reduce((s, seg) => s + Math.max(0, seg.value), 0)
  const percentOf = (v) => ringTotal > 0 ? (Math.max(0, v) / ringTotal) * 100 : 0

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

      <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#111827' }}>{fmtTZS(pipeline.income)}</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Income this month</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 14px' }}>
        <SegmentedPie segments={ringSegments} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, padding: '0 16px 8px' }}>
        <RingLegendItem color={UPKEEP_COLOR} label="Upkeep" percent={percentOf(pipeline.upkeepAllocated)} />
        <RingLegendItem color={LIFESTYLE_PALETTE[0]} label="Lifestyle" percent={percentOf(pipeline.lifestyleAllocatedTotal)} />
        <RingLegendItem color={GROWTH_PALETTE[0]} label="Growth" percent={percentOf(pipeline.growthPoolAmount)} />
      </div>

      {remaining > 0 && (
        <div style={{ textAlign: 'center', padding: '0 16px 8px', fontSize: 12, color: '#e05260' }}>
          Income falls short of your Upkeep + Lifestyle budget by {fmtTZS(remaining)}.
        </div>
      )}

      {pipeline.isLegacyFallback && (
        <div style={{ padding: '4px 16px 0', fontSize: 11, color: '#8b90b2' }}>
          No Collections recorded yet this month — Income includes legacy entries shown as already-clean.
        </div>
      )}

      <div style={{ padding: '10px 16px 40px' }}>
        <SectionDivider title="UPKEEP" total={pipeline.upkeepTarget} color={UPKEEP_COLOR} />
        <FlowRow
          name="Upkeep"
          sub={`Budget ${fmtTZS(pipeline.upkeepTarget)}`}
          amount={pipeline.upkeepAllocated}
          tag={`${pipeline.upkeepPercent.toFixed(0)}% Allocated`}
          tagColor={pipeline.upkeepPercent >= 100 ? '#15803d' : '#b45309'}
          color={UPKEEP_COLOR}
        />

        <SectionDivider title="LIFESTYLE" total={pipeline.lifestyleAllocatedTotal} color={LIFESTYLE_PALETTE[0]} />
        {pipeline.bucketResults.map((b, i) => (
          <FlowRow
            key={b.name}
            name={b.name}
            sub={`Budget ${fmtTZS(b.target)}`}
            amount={b.allocated}
            tag={`${b.percent.toFixed(0)}% Allocated`}
            tagColor={b.percent >= 100 ? '#15803d' : b.percent > 0 ? '#b45309' : '#94a3b8'}
            color={LIFESTYLE_PALETTE[i % LIFESTYLE_PALETTE.length]}
          />
        ))}
        {pipeline.bucketResults.length === 0 && (
          <div style={{ padding: '4px 12px 12px', fontSize: 11, color: '#8b90b2' }}>No Lifestyle buckets yet.</div>
        )}

        <SectionDivider title="GROWTH" total={pipeline.growthContributedTotal} color={GROWTH_PALETTE[0]} />
        {pipeline.growthResults.map((p, i) => (
          <FlowRow
            key={p.name}
            name={p.name}
            sub={`${p.percent}% of surplus`}
            amount={p.contributed}
            color={GROWTH_PALETTE[i % GROWTH_PALETTE.length]}
          />
        ))}
        {pipeline.growthResults.length === 0 && (
          <div style={{ padding: '4px 12px 12px', fontSize: 11, color: '#8b90b2' }}>No Growth pools yet.</div>
        )}
        {pipeline.growthPercentTotal !== 100 && pipeline.growthResults.length > 0 && (
          <div style={{ padding: '0 12px', fontSize: 11, color: '#b45309' }}>
            Unallocated: {(100 - pipeline.growthPercentTotal).toFixed(0)}% — pool percentages don't sum to 100. Edit in Transactions → Growth.
          </div>
        )}
      </div>
    </div>
  )
}
