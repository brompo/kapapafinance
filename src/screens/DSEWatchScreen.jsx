import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS, fmtCompact, calculateAssetMetrics } from '../money'
import { matchAccountToDSE } from '../hooks/useDSEPrices'

const FILTERS = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'owned', label: 'My shares' },
  { id: 'all', label: 'All DSE' },
]

function getHistoricalPrices(symbol, history) {
  if (!history?.entries?.length) return []
  return history.entries
    .map(e => {
      const s = e.shares?.find(sh => sh.s === symbol)
      return s ? { date: e.date, c: s.c, o: s.o, h: s.h, l: s.l, v: s.v } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function periodChange(prices, days) {
  if (prices.length < 2) return null
  const recent = prices[prices.length - 1].c
  const idx = Math.max(0, prices.length - days - 1)
  const past = prices[idx].c
  if (!past) return null
  return ((recent - past) / past) * 100
}

function opportunityScore(company, history) {
  let score = 0
  const prices = getHistoricalPrices(company.symbol, history)
  if (company.change > 0) score += company.change * 2
  const chg30 = periodChange(prices, 30)
  if (chg30 && chg30 > 0) score += chg30
  if (prices.length >= 20 && company.volume > 0) {
    const avgVol = prices.slice(-20).reduce((s, p) => s + (p.v || 0), 0) / 20
    if (avgVol > 0 && company.volume > avgVol * 1.2) score += 10
  }
  if (prices.length >= 50) {
    const sma50 = prices.slice(-50).reduce((s, p) => s + p.c, 0) / 50
    if (company.price > sma50) score += 15
  }
  if (company.deals > 10) score += 5
  if (company.turnover > 10_000_000) score += 5
  return score
}

function computeTopSignal(company, history) {
  if (!company?.price) return null
  const prices = getHistoricalPrices(company.symbol, history)
  const len = prices.length

  if (len >= 50) {
    const sma50 = prices.slice(-50).reduce((s, p) => s + p.c, 0) / 50
    const sma200 = len >= 200 ? prices.slice(-200).reduce((s, p) => s + p.c, 0) / 200 : null
    if (sma200 && sma50 > sma200) return { type: 'bull', label: 'GC' }
    if (sma200 && sma50 < sma200) return { type: 'bear', label: 'DC' }
    if (company.price > sma50) return { type: 'bull', label: '>SMA50' }
  }

  if (len >= 20) {
    const lookback = prices.slice(-Math.min(len, 260))
    const high52 = Math.max(...lookback.map(p => p.c))
    const low52 = Math.min(...lookback.map(p => p.c))
    if (company.price <= low52 * 1.05) return { type: 'info', label: '52w Low' }
    if (company.price >= high52 * 0.95) return { type: 'warn', label: '52w Hi' }
  }

  if (company.change > 3) return { type: 'bull', label: 'Hot' }
  if (company.change < -3) return { type: 'bear', label: 'Dip' }
  return null
}

const S = {
  // reusable inline style fragments
  pctColor: (v) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#94a3b8',
  fmtPct: (v) => {
    if (v == null) return '—'
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
  },
  signalColors: {
    bull: { bg: '#e8f5e9', color: '#1b5e20' },
    bear: { bg: '#fbe9e7', color: '#bf360c' },
    info: { bg: '#e3f2fd', color: '#0d47a1' },
    warn: { bg: '#fff8e1', color: '#e65100' },
  }
}

export default function DSEWatchScreen() {
  const { dse, accounts, allAccountTxns, addAccountTxn, show, setTab } = useAppContext()
  const [filter, setFilter] = useState('opportunities')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(false)
  const [detail, setDetail] = useState(null)
  const [buyModal, setBuyModal] = useState(null)
  const [buyQty, setBuyQty] = useState('')
  const [buyFee, setBuyFee] = useState('')
  const [buyAccountId, setBuyAccountId] = useState('')

  const companies = dse.prices?.companies || []
  const priceDate = dse.prices?.date || ''

  useEffect(() => { dse.fetchHistory() }, [])

  const ownedSymbols = useMemo(() => {
    const map = new Map()
    for (const acct of accounts) {
      if (acct.groupType !== 'asset') continue
      const match = matchAccountToDSE(acct.name, companies)
      if (match) {
        const metrics = calculateAssetMetrics(acct, allAccountTxns, 'asset')
        if (metrics.hasData && metrics.qty > 0)
          map.set(match.symbol, { account: acct, metrics })
      }
    }
    return map
  }, [accounts, allAccountTxns, companies])

  const shareAccounts = useMemo(() => accounts.filter(a => a.groupType === 'asset'), [accounts])

  const filtered = useMemo(() => {
    let list = companies.filter(c => c.price > 0)
    if (search) {
      const q = search.toUpperCase()
      list = list.filter(c => c.symbol.includes(q) || c.name.toUpperCase().includes(q))
    }
    if (filter === 'owned') list = list.filter(c => ownedSymbols.has(c.symbol))

    if (sortCol) {
      const dir = sortAsc ? 1 : -1
      list = [...list].sort((a, b) => {
        const av = sortCol === 'symbol' ? a.symbol : (a[sortCol] || 0)
        const bv = sortCol === 'symbol' ? b.symbol : (b[sortCol] || 0)
        if (typeof av === 'string') return dir * av.localeCompare(bv)
        return dir * (av - bv)
      })
    } else {
      switch (filter) {
        case 'opportunities':
          list = [...list].sort((a, b) => opportunityScore(b, dse.history) - opportunityScore(a, dse.history))
          break
        case 'momentum':
          list = [...list].sort((a, b) => (b.change || 0) - (a.change || 0))
          break
        case 'all':
          list = [...list].sort((a, b) => a.symbol.localeCompare(b.symbol))
          break
      }
    }
    return list
  }, [companies, filter, search, dse.history, ownedSymbols, sortCol, sortAsc])

  const handleSort = (col) => {
    if (sortCol === col) {
      if (!sortAsc) setSortAsc(true)
      else { setSortCol(null); setSortAsc(false) }
    } else {
      setSortCol(col)
      setSortAsc(false)
    }
  }

  const handleBuy = useCallback((company) => {
    setBuyModal(company)
    setBuyQty('')
    setBuyFee('')
    const match = [...ownedSymbols.entries()].find(([sym]) => sym === company.symbol)
    setBuyAccountId(match ? match[1].account.id : (shareAccounts[0]?.id || ''))
  }, [ownedSymbols, shareAccounts])

  const confirmBuy = () => {
    if (!buyModal || !buyQty || !buyAccountId) return show('Fill in quantity and account.')
    const qty = Number(buyQty)
    if (qty <= 0) return show('Enter a valid quantity.')
    const total = qty * buyModal.price
    const fee = Number(buyFee || 0)
    addAccountTxn({
      accountId: buyAccountId,
      amount: total + fee,
      direction: 'in',
      kind: 'purchase',
      receiveDate: new Date().toISOString().slice(0, 10),
      unit: buyModal.symbol,
      quantity: qty,
      unitPrice: buyModal.price,
      fee: fee || undefined,
      note: `Buy ${qty} ${buyModal.symbol} @ TZS ${fmtTZS(buyModal.price)}`,
    })
    show(`Purchased ${qty} ${buyModal.symbol} shares`)
    setBuyModal(null)
    setTab('accounts')
  }

  if (dse.loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading DSE market data...</div>
  }

  if (dse.error || !companies.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>
          {dse.error ? `Failed to load DSE data: ${dse.error}` : 'No DSE data available yet.'}
        </div>
        <button onClick={dse.fetchPrices} className="btn" style={{ color: '#5a5fb0' }}>Retry</button>
      </div>
    )
  }

  const active = companies.filter(c => c.price > 0)
  const gainers = active.filter(c => c.change > 0).length
  const losers = active.filter(c => c.change < 0).length
  const totalTurnover = active.reduce((s, c) => s + (c.turnover || 0), 0)

  const sortIcon = (col) => {
    if (sortCol !== col) return ''
    return sortAsc ? ' ↑' : ' ↓'
  }

  return (
    <div style={{ padding: '12px 0 100px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>DSE Watch</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {priceDate} &middot; {gainers} <span style={{ color: '#16a34a' }}>▲</span> &middot; {losers} <span style={{ color: '#dc2626' }}>▼</span> &middot; T/O {fmtCompact(totalTurnover)}
          </div>
        </div>
        <button
          onClick={dse.fetchPrices}
          style={{
            padding: '5px 12px', fontSize: 12, fontWeight: 500,
            color: '#5a5fb0', background: '#f8f8ff', border: '1px solid #e8e8f8',
            borderRadius: 6, cursor: 'pointer'
          }}
        >
          ↻
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search symbol or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1px solid #e2e8f0', borderRadius: 8,
            outline: 'none', boxSizing: 'border-box', background: '#f8fafc'
          }}
        />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px', marginBottom: 10, overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setSortCol(null) }}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 500,
              borderRadius: 16, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: filter === f.id ? '#5a5fb0' : '#f1f5f9',
              color: filter === f.id ? '#fff' : '#64748b',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
              <th onClick={() => handleSort('symbol')} style={thStyle}>Symbol{sortIcon('symbol')}</th>
              <th onClick={() => handleSort('price')} style={{ ...thStyle, textAlign: 'right' }}>Price{sortIcon('price')}</th>
              <th onClick={() => handleSort('change')} style={{ ...thStyle, textAlign: 'right' }}>Chg%{sortIcon('change')}</th>
              <th onClick={() => handleSort('volume')} style={{ ...thStyle, textAlign: 'right' }}>Vol{sortIcon('volume')}</th>
              <th style={{ ...thStyle, textAlign: 'center', width: 44 }}>Sig</th>
              <th style={{ ...thStyle, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                {filter === 'owned' ? 'No DSE shares in your accounts.' : 'No matches.'}
              </td></tr>
            ) : filtered.map(c => {
              const owned = ownedSymbols.has(c.symbol)
              const signal = computeTopSignal(c, dse.history)
              const sc = signal ? S.signalColors[signal.type] : null
              const isExpanded = detail === c.symbol
              return (
                <React.Fragment key={c.symbol}>
                  <tr
                    onClick={() => setDetail(isExpanded ? null : c.symbol)}
                    style={{
                      borderBottom: '1px solid #f8fafc',
                      cursor: 'pointer',
                      background: isExpanded ? '#fafaff' : owned ? '#faf9ff' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 8px 10px 16px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {c.symbol}
                      {owned && <span style={{
                        display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                        background: '#5a5fb0', marginLeft: 5, verticalAlign: 'middle'
                      }} />}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 500, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtTZS(c.price)}
                    </td>
                    <td style={{
                      padding: '10px 8px', textAlign: 'right', fontWeight: 600,
                      color: S.pctColor(c.change), fontVariantNumeric: 'tabular-nums'
                    }}>
                      {S.fmtPct(c.change)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                      {c.volume ? fmtCompact(c.volume) : '—'}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                      {signal && (
                        <span style={{
                          fontSize: 10, padding: '2px 5px', borderRadius: 4,
                          background: sc.bg, color: sc.color, fontWeight: 600, whiteSpace: 'nowrap'
                        }}>{signal.label}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px 10px 4px', textAlign: 'center' }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleBuy(c) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#5a5fb0', fontSize: 16, padding: 0, lineHeight: 1
                        }}
                        title={`Buy ${c.symbol}`}
                      >+</button>
                    </td>
                  </tr>
                  {isExpanded && <DetailRow company={c} history={dse.history} owned={ownedSymbols.get(c.symbol)} />}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Buy Modal */}
      {buyModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}
          onClick={() => setBuyModal(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: 24,
              width: '100%', maxWidth: 360, boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
              Buy {buyModal.symbol}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              {buyModal.name} &middot; TZS {fmtTZS(buyModal.price)}
            </div>

            <label style={labelStyle}>Account</label>
            <select value={buyAccountId} onChange={e => setBuyAccountId(e.target.value)} style={inputStyle}>
              <option value="">Select account...</option>
              {shareAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            <label style={labelStyle}>Quantity (shares)</label>
            <input type="number" inputMode="numeric" placeholder="e.g. 100" value={buyQty}
              onChange={e => setBuyQty(e.target.value)} style={inputStyle} />

            <label style={labelStyle}>Brokerage fee (optional)</label>
            <input type="number" inputMode="numeric" placeholder="e.g. 5000" value={buyFee}
              onChange={e => setBuyFee(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />

            {buyQty && Number(buyQty) > 0 && (
              <div style={{ background: '#f0f0ff', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#64748b' }}>{buyQty} x TZS {fmtTZS(buyModal.price)}</span>
                  <span style={{ fontWeight: 600 }}>TZS {fmtTZS(Number(buyQty) * buyModal.price)}</span>
                </div>
                {buyFee && Number(buyFee) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#64748b' }}>Fee</span>
                    <span style={{ fontWeight: 600 }}>TZS {fmtTZS(buyFee)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e0e0f5', paddingTop: 4, fontWeight: 700, color: '#5a5fb0' }}>
                  <span>Total</span>
                  <span>TZS {fmtTZS(Number(buyQty) * buyModal.price + Number(buyFee || 0))}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setBuyModal(null)} style={{ ...btnStyle, color: '#64748b', background: '#f1f5f9' }}>Cancel</button>
              <button onClick={confirmBuy} style={{ ...btnStyle, color: '#fff', background: '#5a5fb0' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ company, history, owned }) {
  const c = company
  const prices = getHistoricalPrices(c.symbol, history)
  const chg7 = periodChange(prices, 7)
  const chg30 = periodChange(prices, 30)
  const chg90 = periodChange(prices, 90)

  const len = prices.length
  let high52 = c.high, low52 = c.low
  if (len >= 20) {
    const lookback = prices.slice(-Math.min(len, 260))
    high52 = Math.max(...lookback.map(p => p.c))
    low52 = Math.min(...lookback.map(p => p.c))
  }

  return (
    <tr>
      <td colSpan={6} style={{ padding: '0 16px 12px', background: '#fafaff' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4, textAlign: 'center', padding: '8px 0', fontSize: 11
        }}>
          <MetricCell label="7d" value={S.fmtPct(chg7)} color={S.pctColor(chg7)} />
          <MetricCell label="30d" value={S.fmtPct(chg30)} color={S.pctColor(chg30)} />
          <MetricCell label="90d" value={S.fmtPct(chg90)} color={S.pctColor(chg90)} />
          <MetricCell label="52w" value={high52 && low52 ? `${fmtTZS(low52)}–${fmtTZS(high52)}` : '—'} color="#475569" />
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4, textAlign: 'center', fontSize: 11, borderTop: '1px solid #f1f5f9', paddingTop: 6
        }}>
          <MetricCell label="Open" value={fmtTZS(c.open)} color="#475569" />
          <MetricCell label="High" value={fmtTZS(c.high)} color="#475569" />
          <MetricCell label="Low" value={fmtTZS(c.low)} color="#475569" />
          <MetricCell label="Turnover" value={fmtCompact(c.turnover)} color="#475569" />
        </div>
        {c.pe && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4, textAlign: 'center', fontSize: 11, borderTop: '1px solid #f1f5f9', paddingTop: 6, marginTop: 4
          }}>
            {c.pe && <MetricCell label="P/E" value={c.pe.toFixed(1)} color="#475569" />}
            {c.eps && <MetricCell label="EPS" value={fmtTZS(c.eps)} color="#475569" />}
            {c.dividendYield && <MetricCell label="Div%" value={c.dividendYield.toFixed(1) + '%'} color="#475569" />}
          </div>
        )}
        {owned && (
          <div style={{
            marginTop: 6, padding: '6px 10px', background: '#ede9fe', borderRadius: 6,
            fontSize: 11, color: '#5b21b6', display: 'flex', justifyContent: 'space-between'
          }}>
            <span>You own: {fmtTZS(owned.metrics.qty)} shares</span>
            <span>Avg: TZS {fmtTZS(owned.metrics.avgPrice)}</span>
            <span>Value: TZS {fmtTZS(owned.metrics.marketValue)}</span>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>{c.name} &middot; Deals: {c.deals}</div>
      </td>
    </tr>
  )
}

function MetricCell({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 1 }}>{label}</div>
      <div style={{ fontWeight: 600, color, fontSize: 12 }}>{value}</div>
    </div>
  )
}

const thStyle = {
  padding: '8px 8px',
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  textAlign: 'left',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: '#fff',
}

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  border: '1px solid #e2e8f0', borderRadius: 8,
  marginBottom: 12, background: '#f8fafc', boxSizing: 'border-box'
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }

const btnStyle = {
  flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
  border: 'none', borderRadius: 8, cursor: 'pointer'
}
