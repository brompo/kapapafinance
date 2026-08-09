import React, { useMemo, useState, useEffect } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts'
import { useAppContext } from '../context/AppContext'
import { computeKapapaReturns, computeKapapaTrend } from '../utils/returns'
import { getKapapaGoalMultipleForMonth, withKapapaGoalMultipleForMonth } from '../utils/ledger'
import DSEWatchScreen from './DSEWatchScreen'

function fmtMultiple(m) {
  if (m == null || !Number.isFinite(m)) return '—'
  return `${m.toFixed(2)}x`
}

function fmtAnnualPercent(rate) {
  if (rate == null || !Number.isFinite(rate)) return ''
  const pct = rate * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%/yr`
}

function GroupRow({ name, result, goalMultiple }) {
  const meetsGoal = result.multiple != null && result.multiple >= goalMultiple
  const color = result.multiple == null ? '#94a3b8' : meetsGoal ? '#16a34a' : '#ef4444'
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14, background: `${color}0f`, border: `1px solid ${color}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          {result.accountCount} account{result.accountCount === 1 ? '' : 's'}
          {result.isPartial ? ' · partial history' : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color }}>{fmtMultiple(result.multiple)}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtAnnualPercent(result.rate)}</div>
      </div>
    </div>
  )
}

// Kapapa answers one question: is my money generating at least the goal
// multiple (e.g. 1.5x) per year? Blended headline pools cash flows across
// every asset account (Invest/Shares/Real Estate/etc — any group of type
// 'asset'); the by-group breakdown below reruns the same calc per group. See
// src/utils/returns.js for the trailing-12mo XIRR math and debt netting.
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
  const trend = useMemo(
    () => computeKapapaTrend(accounts, groups, accountTxns, 12),
    [accounts, groups, accountTxns]
  )

  const blended = returns.blended
  const meetsGoal = blended.hasData && blended.multiple != null && blended.multiple >= goalMultiple
  const progressPct = blended.hasData && blended.multiple != null
    ? Math.max(0, Math.min((blended.multiple / goalMultiple) * 100, 100))
    : 0

  const openGoalEdit = () => {
    setEditGoalValue(String(goalMultiple))
    setShowGoalEdit(true)
  }

  const saveGoalEdit = () => {
    const nextValue = Number(String(editGoalValue).replace(/,/g, '')) || 0
    if (nextValue <= 0) return show('Enter a valid target multiple.')
    updateSettings({
      ...settings,
      kapapaReturnGoal: withKapapaGoalMultipleForMonth(settings.kapapaReturnGoal, monthKey, nextValue)
    })
    show('Updated.')
    setShowGoalEdit(false)
  }

  const chartData = trend.map(p => ({ label: p.month.slice(2).replace('-', '/'), multiple: p.multiple }))

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
              Add an Invest, Shares, or Real Estate account to start tracking whether your money is generating {fmtMultiple(goalMultiple)}/year.
            </div>
            <button className="miniBtn" type="button" onClick={() => setTab('accounts')}>Go to Accounts</button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
              <div onClick={openGoalEdit} style={{ cursor: 'pointer' }} role="button" aria-label="Edit Kapapa Goal">
                <div style={{ fontSize: 30, fontWeight: 800, color: blended.hasData ? (meetsGoal ? '#16a34a' : '#ef4444') : '#111827' }}>
                  {fmtMultiple(blended.multiple)} <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>/ year</span>
                </div>
                <div className="familyGoalBarBg">
                  <div
                    className="familyGoalBarFill"
                    style={{ width: `${progressPct}%`, background: meetsGoal ? '#16a34a' : '#ef4444' }}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Goal: ≥{fmtMultiple(goalMultiple)} ✎</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  {fmtAnnualPercent(blended.rate)} annualized, trailing 12 months
                  {blended.isPartial ? ' · partial history' : ''}
                </div>
              </div>
            </div>

            <div className="card" style={{ margin: '18px 0 4px', padding: '16px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>Trailing 12mo return, by month</div>
              <div style={{ width: '100%', height: 140 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(1)}x`} width={36} />
                    <ReferenceLine y={goalMultiple} stroke="#16a34a" strokeDasharray="4 4" />
                    <Tooltip formatter={(value) => [fmtMultiple(value), 'Multiple']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f1f5f9' }} />
                    <Line type="monotone" dataKey="multiple" stroke="#5a5fb0" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', letterSpacing: 0.3, margin: '0 4px 10px' }}>BY GROUP</div>
              {returns.byGroup.map(g => (
                <GroupRow key={g.groupId} name={g.name} result={g} goalMultiple={goalMultiple} />
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
              <label>Money should generate at least (x per year)</label>
              <input inputMode="decimal" value={editGoalValue} onChange={e => setEditGoalValue(e.target.value)} placeholder="e.g. 1.5" autoFocus />
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
