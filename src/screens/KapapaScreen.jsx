import React, { useMemo, useState, useEffect } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { useAppContext } from '../context/AppContext'
import { computeKapapaReturns } from '../utils/returns'
import { getKapapaGoalMultipleForMonth, withKapapaGoalMultipleForMonth } from '../utils/ledger'
import { fmtTZS } from '../money.js'
import DSEWatchScreen from './DSEWatchScreen'

// Fixed-order categorical palette (dataviz skill default, validated for
// adjacent-pair CVD/normal-vision separation) — assigned to asset groups by
// position, never cycled or reassigned by rank, so a group keeps its color
// across the pie chart and its section header in the holdings list.
const GROUP_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const RADIAN = Math.PI / 180

function fmtAnnualPercent(rate) {
  if (rate == null || !Number.isFinite(rate)) return ''
  const pct = rate * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%/yr`
}

function fmtPercent(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—'
  const pct = rate * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function goalColor(rate, goalMultiple) {
  if (rate == null || !Number.isFinite(rate)) return '#94a3b8'
  return 1 + rate >= goalMultiple ? '#16a34a' : '#ef4444'
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={800}>
      {Math.round(percent * 100)}%
    </text>
  )
}

function AssetRow({ name, value, simpleRate, xirrRate, goalMultiple, isLast, index }) {
  const color = goalColor(simpleRate, goalMultiple)
  return (
    <div style={{
      padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: isLast ? 'none' : '1px solid #e2e8f0',
      background: index % 2 === 1 ? '#f8fafc' : '#fff'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{name}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtTZS(value)}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{fmtPercent(simpleRate)}</div>
        {xirrRate != null && <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtAnnualPercent(xirrRate)}</div>}
      </div>
    </div>
  )
}

function GroupSection({ group, color, goalMultiple }) {
  return (
    <div style={{
      borderRadius: 14, background: '#fff', border: `1px solid ${color}33`, marginBottom: 10, overflow: 'hidden'
    }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${color}22` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{group.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {group.accountCount} account{group.accountCount === 1 ? '' : 's'}
              {group.isPartial ? ' · partial history' : ''}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color }}>{fmtPercent(group.simpleRate)}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtAnnualPercent(group.xirrRate)}</div>
        </div>
      </div>
      <div>
        {group.holdings.length === 0 ? (
          <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>No current holdings — fully divested.</div>
        ) : (
          group.holdings.map((h, i) => (
            <AssetRow
              key={h.accountId}
              name={h.name}
              value={h.value}
              simpleRate={h.simpleRate}
              xirrRate={h.xirrRate}
              goalMultiple={goalMultiple}
              isLast={i === group.holdings.length - 1}
              index={i}
            />
          ))
        )}
      </div>
    </div>
  )
}

// Kapapa answers one question: is my money generating at least the goal
// percentage (e.g. 50%) per year? Blended headline pools cash flows across
// every asset account (Invest/Shares/Real Estate/etc — any group of type
// 'asset'); the holdings list below breaks that same universe down to
// individual assets, grouped for orientation but ranked by their own return.
export default function KapapaScreen() {
  const { settings, updateSettings, accounts, groups, accountTxns, show, setTab } = useAppContext()

  const [view, setView] = useState('returns')
  useEffect(() => {
    if (view === 'dse' && !settings.dseEnabled) setView('returns')
  }, [view, settings.dseEnabled])
  const showDSE = view === 'dse' && settings.dseEnabled

  const [showGoalEdit, setShowGoalEdit] = useState(false)
  const [editGoalValue, setEditGoalValue] = useState('')

  const monthKey = new Date().toISOString().slice(0, 7)
  const goalMultiple = getKapapaGoalMultipleForMonth(settings.kapapaReturnGoal, monthKey)

  const returns = useMemo(
    () => computeKapapaReturns(accounts, groups, accountTxns),
    [accounts, groups, accountTxns]
  )

  const allocation = useMemo(() => {
    const withValue = returns.byGroup.filter(g => g.totalValue > 0)
    const total = withValue.reduce((s, g) => s + g.totalValue, 0)
    const slices = withValue.map((g, i) => ({
      groupId: g.groupId,
      name: g.name,
      value: g.totalValue,
      color: GROUP_PALETTE[i] || '#94a3b8'
    }))
    return { total, slices }
  }, [returns.byGroup])

  const groupColors = useMemo(
    () => new Map(allocation.slices.map(s => [s.groupId, s.color])),
    [allocation.slices]
  )

  const blended = returns.blended
  const meetsGoal = blended.hasData && blended.multiple != null && blended.multiple >= goalMultiple
  const progressPct = blended.hasData && blended.multiple != null
    ? Math.max(0, Math.min((blended.multiple / goalMultiple) * 100, 100))
    : 0

  const openGoalEdit = () => {
    setEditGoalValue(String(Math.round((goalMultiple - 1) * 1000) / 10))
    setShowGoalEdit(true)
  }

  const saveGoalEdit = () => {
    const nextPct = Number(String(editGoalValue).replace(/,/g, ''))
    const nextMultiple = 1 + nextPct / 100
    if (!Number.isFinite(nextPct) || nextMultiple <= 0) return show('Enter a valid target percentage.')
    updateSettings({
      ...settings,
      kapapaReturnGoal: withKapapaGoalMultipleForMonth(settings.kapapaReturnGoal, monthKey, nextMultiple)
    })
    show('Updated.')
    setShowGoalEdit(false)
  }

  return (
    <div className="ledgerScreen">
      <div className="ledgerHeader">
        <div className="ledgerGhost" style={{ cursor: 'default' }}>Kapapa</div>
        <div style={{ width: 40 }} />
        <div style={{ width: 40 }} />
      </div>

      {settings.dseEnabled && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {[{ id: 'returns', label: 'Returns' }, { id: 'dse', label: 'DSE Watch' }].map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 16, border: 'none', cursor: 'pointer',
                background: view === v.id ? '#5a5fb0' : '#f1f5f9',
                color: view === v.id ? '#fff' : '#64748b'
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {showDSE ? <DSEWatchScreen /> : (
        !returns.hasAssets ? (
          <div style={{ textAlign: 'center', padding: '60px 16px', color: '#94a3b8' }}>
            <div style={{ fontSize: 14, marginBottom: 12 }}>No investment accounts yet.</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              Add an Invest, Shares, or Real Estate account to start tracking whether your money is generating at least {fmtPercent(goalMultiple - 1)} a year.
            </div>
            <button className="miniBtn" type="button" onClick={() => setTab('accounts')}>Go to Accounts</button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
              <div onClick={openGoalEdit} style={{ cursor: 'pointer' }} role="button" aria-label="Edit Kapapa Goal">
                <div style={{ fontSize: 30, fontWeight: 800, color: blended.hasData ? (meetsGoal ? '#16a34a' : '#ef4444') : '#111827' }}>
                  {fmtPercent(blended.simpleRate)} <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>for the year</span>
                </div>
                <div className="familyGoalBarBg">
                  <div
                    className="familyGoalBarFill"
                    style={{ width: `${progressPct}%`, background: meetsGoal ? '#16a34a' : '#ef4444' }}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Goal: ≥{fmtPercent(goalMultiple - 1)} ✎</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  put in vs. got out, trailing 12 months
                  {blended.isPartial ? ' · partial history' : ''}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {fmtAnnualPercent(blended.xirrRate)} annualized (XIRR)
                </div>
              </div>
            </div>

            {allocation.total > 0 && (
              <div className="card" style={{ margin: '18px 0 4px', padding: '16px 14px' }}>
                <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                  Total Assets: {fmtTZS(allocation.total)}
                </div>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={allocation.slices}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={90}
                        isAnimationActive={false}
                        label={renderPieLabel}
                        labelLine={false}
                      >
                        {allocation.slices.map(s => <Cell key={s.groupId} fill={s.color} stroke="#fff" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${fmtTZS(value)} (${Math.round((value / allocation.total) * 100)}%)`, name]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f1f5f9' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 4 }}>
                  {allocation.slices.map(s => (
                    <div key={s.groupId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, flexShrink: 0 }} />
                        <span style={{ color: '#1e293b', fontWeight: 600 }}>{s.name}</span>
                      </div>
                      <div style={{ color: '#64748b' }}>
                        {Math.round((s.value / allocation.total) * 100)}% · {fmtTZS(s.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: 0.3, margin: '0 4px 10px' }}>HOLDINGS</div>
              {returns.byGroup.map(g => (
                <GroupSection
                  key={g.groupId}
                  group={g}
                  color={groupColors.get(g.groupId) || '#94a3b8'}
                  goalMultiple={goalMultiple}
                />
              ))}
            </div>
          </>
        )
      )}

      {showGoalEdit && (
        <div className="modalBackdrop" onClick={() => setShowGoalEdit(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Kapapa Goal</div>
            <div className="field">
              <label>Money should generate at least (% per year)</label>
              <input inputMode="decimal" value={editGoalValue} onChange={e => setEditGoalValue(e.target.value)} placeholder="e.g. 50" autoFocus />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                Applies from this month onward — earlier months keep their existing goal.
              </div>
            </div>
            <div className="modalActions">
              <button className="btn" onClick={() => setShowGoalEdit(false)}>Cancel</button>
              <button className="btn primary" onClick={saveGoalEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
