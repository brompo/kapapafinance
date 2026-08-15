import { calculateAssetMetrics } from '../money.js'
import { todayISO } from '../money.js'

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

function xnpv(rate, flows, t0Ms) {
  return flows.reduce((sum, f) => {
    const years = (new Date(f.date + 'T00:00:00').getTime() - t0Ms) / MS_PER_YEAR
    return sum + f.amount / Math.pow(1 + rate, years)
  }, 0)
}

// Bisection rather than Newton-Raphson — guaranteed to converge for the
// monotonic invest-then-return cash flow shapes this app produces, and never
// diverges the way Newton can on a bad initial guess.
export function xirr(flows) {
  const clean = (flows || []).filter(f => f && f.date && Number.isFinite(f.amount) && f.amount !== 0)
  if (clean.length < 2) return null
  const sorted = [...clean].sort((a, b) => a.date.localeCompare(b.date))
  const hasIn = sorted.some(f => f.amount < 0)
  const hasOut = sorted.some(f => f.amount > 0)
  if (!hasIn || !hasOut) return null

  const t0Ms = new Date(sorted[0].date + 'T00:00:00').getTime()
  const f = rate => xnpv(rate, sorted, t0Ms)

  // Scan a wide rate grid (-99.99% to +10,000%/yr) for the first bracket
  // where NPV changes sign, then bisect inside it.
  const grid = [-0.9999, -0.999, -0.99, -0.95, -0.9, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 25, 50, 100]
  let lo = null, hi = null, loVal = null, hiVal = null
  let prevVal = f(grid[0])
  for (let i = 1; i < grid.length; i++) {
    const val = f(grid[i])
    if (Number.isFinite(prevVal) && Number.isFinite(val) && (prevVal < 0) !== (val < 0)) {
      lo = grid[i - 1]; hi = grid[i]; loVal = prevVal; hiVal = val
      break
    }
    prevVal = val
  }
  if (lo === null) return null

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const midVal = f(mid)
    if (!Number.isFinite(midVal)) break
    if ((midVal < 0) === (loVal < 0)) { lo = mid; loVal = midVal } else { hi = mid; hiVal = midVal }
    if (hi - lo < 1e-9) break
  }
  return (lo + hi) / 2
}

function accountBalanceAsOf(account, accountTxns, dateISO) {
  if (!account) return 0
  return accountTxns
    .filter(t => t.accountId === account.id && t.date <= dateISO)
    .reduce((s, t) => s + (t.direction === 'in' ? Number(t.amount || 0) : -Number(t.amount || 0)), 0)
}

// Builds a trailing-window cash-flow series for one asset account: a starting
// "invested" flow (net of any linked debt), each real external cash movement
// inside the window, and a final "if you cashed out today" flow — the shape
// XIRR needs. Draws/paybacks against a linked obligations account (e.g. a
// business loan funding this capital account) are netted at the balance
// level instead of counted as the investor's own money, and excluded here so
// they aren't double-counted as a contribution.
export function computeAccountReturn(account, accountTxns, allAccounts, groupsById, asOfDate, windowMonths = 12) {
  const windowEnd = asOfDate
  const startDate = new Date(windowEnd + 'T00:00:00')
  startDate.setMonth(startDate.getMonth() - windowMonths)
  const windowStart = startDate.toISOString().slice(0, 10)

  const ownTxns = accountTxns.filter(t => t.accountId === account.id)
  const realTxns = ownTxns.filter(t => t.kind !== 'valuation')
  if (!realTxns.length) return { hasData: false }

  const inceptionDate = realTxns.reduce((min, t) => (!min || t.date < min ? t.date : min), null)
  const effectiveStart = inceptionDate > windowStart ? inceptionDate : windowStart
  const isPartial = inceptionDate > windowStart

  const linkedDebtIds = new Set()
  for (const t of ownTxns) {
    if (!t.relatedAccountId) continue
    const rel = allAccounts.find(a => a.id === t.relatedAccountId)
    if (rel && groupsById.get(rel.groupId)?.metaCategory === 'obligations') linkedDebtIds.add(rel.id)
  }
  const linkedDebtAccounts = [...linkedDebtIds].map(id => allAccounts.find(a => a.id === id)).filter(Boolean)
  const debtBalanceAsOf = (dateISO) => linkedDebtAccounts.reduce((s, d) => s + accountBalanceAsOf(d, accountTxns, dateISO), 0)

  const grossStart = calculateAssetMetrics(account, accountTxns, 'asset', effectiveStart).marketValue || 0
  const netStart = grossStart - debtBalanceAsOf(effectiveStart)

  const grossEnd = calculateAssetMetrics(account, accountTxns, 'asset', windowEnd).marketValue || 0
  const netEnd = grossEnd - debtBalanceAsOf(windowEnd)

  const flows = [{ date: effectiveStart, amount: -netStart }]

  for (const t of realTxns) {
    if (t.date <= effectiveStart || t.date > windowEnd) continue
    if (t.relatedAccountId && linkedDebtIds.has(t.relatedAccountId)) continue
    const amt = Number(t.amount || 0)
    if (!amt) continue
    if (t.kind === 'purchase') flows.push({ date: t.date, amount: -amt })
    else if (t.kind === 'sale') flows.push({ date: t.date, amount: amt })
    else if (t.kind !== 'credit') flows.push({ date: t.date, amount: t.direction === 'in' ? -amt : amt })
  }

  flows.push({ date: windowEnd, amount: netEnd })

  return { hasData: true, flows, isPartial, netStart, netEnd }
}

// Wraps computeAccountReturn with the two things a holding row needs beyond
// the raw XIRR flows: the annualized rate itself, and the account's current
// gross market value (undiscounted by any linked debt — that netting only
// applies to the return math, not the displayed value).
function accountHoldingResult(account, accountTxns, allAccounts, groupsById, asOfDate, windowMonths) {
  const r = computeAccountReturn(account, accountTxns, allAccounts, groupsById, asOfDate, windowMonths)
  const marketValue = calculateAssetMetrics(account, accountTxns, 'asset', asOfDate).marketValue || 0
  return {
    accountId: account.id,
    name: account.name,
    value: marketValue,
    rate: r.hasData ? xirr(r.flows) : null,
    isPartial: r.hasData ? r.isPartial : false,
    flows: r.hasData ? r.flows : null
  }
}

function sortByRateDesc(holdings) {
  return [...holdings].sort((a, b) => {
    if (a.rate == null && b.rate == null) return 0
    if (a.rate == null) return 1
    if (b.rate == null) return -1
    return b.rate - a.rate
  })
}

// Top-level entry point: blended XIRR across every asset-type account, plus
// one entry per asset group — each carrying its own pooled XIRR, total
// current value, and a per-account holdings breakdown (sorted best → worst
// annualized return) so the UI can show individual asset performance instead
// of only the group rollup. Holdings with too little cash-flow history for
// XIRR still appear (value-only, rate: null) rather than being dropped.
export function computeKapapaReturns(accounts, groups, accountTxns, asOfDate = todayISO(), windowMonths = 12) {
  const groupsById = new Map((groups || []).map(g => [g.id, g]))
  const assetGroups = (groups || []).filter(g => g.type === 'asset')
  const assetAccounts = (accounts || []).filter(a => !a.archived && groupsById.get(a.groupId)?.type === 'asset')

  const groupResults = assetGroups
    .map(g => {
      const groupAccounts = assetAccounts.filter(a => a.groupId === g.id)
      if (!groupAccounts.length) return null
      const holdings = groupAccounts.map(a =>
        accountHoldingResult(a, accountTxns, accounts, groupsById, asOfDate, windowMonths)
      )
      const flows = holdings.filter(h => h.flows).flatMap(h => h.flows)
      const rate = flows.length ? xirr(flows) : null
      return {
        groupId: g.id,
        name: g.name,
        rate,
        isPartial: holdings.some(h => h.isPartial),
        accountCount: groupAccounts.length,
        totalValue: holdings.reduce((s, h) => s + h.value, 0),
        holdings
      }
    })
    .filter(Boolean)

  const blendedFlows = groupResults.flatMap(g => g.holdings.filter(h => h.flows).flatMap(h => h.flows))
  const blendedRate = blendedFlows.length ? xirr(blendedFlows) : null
  const blended = {
    hasData: blendedRate != null,
    rate: blendedRate,
    multiple: blendedRate == null ? null : 1 + blendedRate,
    isPartial: groupResults.some(g => g.isPartial),
    accountCount: assetAccounts.length
  }

  const byGroup = groupResults.map(g => ({
    groupId: g.groupId,
    name: g.name,
    hasData: g.rate != null,
    rate: g.rate,
    multiple: g.rate == null ? null : 1 + g.rate,
    isPartial: g.isPartial,
    accountCount: g.accountCount,
    totalValue: g.totalValue,
    holdings: sortByRateDesc(g.holdings).map(({ flows, ...rest }) => rest)
  }))

  return { blended, byGroup, hasAssets: assetAccounts.length > 0 }
}
