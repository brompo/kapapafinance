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

// Total money put in vs. total money got out (sale proceeds + what you still
// hold today) over the same flow set XIRR uses — no compounding/annualizing.
// This is the number that answers "of everything I put into this, what do I
// have to show for it now"; XIRR answers a different question ("what
// constant yearly rate would this be equivalent to"), which explodes for
// gains realized quickly (a 44-day 52% gain annualizes past 3000%). Both are
// kept: simple return is primary display, XIRR is secondary context.
function simpleReturn(flows) {
  const putIn = (flows || []).reduce((s, f) => s + (f.amount < 0 ? -f.amount : 0), 0)
  const gotOut = (flows || []).reduce((s, f) => s + (f.amount > 0 ? f.amount : 0), 0)
  return { putIn, gotOut, rate: putIn > 0 ? (gotOut - putIn) / putIn : null }
}

// Wraps computeAccountReturn with the two things a holding row needs beyond
// the raw flows: both return figures (simple put-in-vs-got-out, and
// annualized XIRR), and the account's current gross market value
// (undiscounted by any linked debt — that netting only applies to the
// return math, not the displayed value).
export function accountHoldingResult(account, accountTxns, allAccounts, groupsById, asOfDate, windowMonths) {
  const r = computeAccountReturn(account, accountTxns, allAccounts, groupsById, asOfDate, windowMonths)
  const marketValue = calculateAssetMetrics(account, accountTxns, 'asset', asOfDate).marketValue || 0
  return {
    accountId: account.id,
    name: account.name,
    value: marketValue,
    simpleRate: r.hasData ? simpleReturn(r.flows).rate : null,
    xirrRate: r.hasData ? xirr(r.flows) : null,
    isPartial: r.hasData ? r.isPartial : false,
    flows: r.hasData ? r.flows : null
  }
}

function sortBySimpleRateDesc(holdings) {
  return [...holdings].sort((a, b) => {
    if (a.simpleRate == null && b.simpleRate == null) return 0
    if (a.simpleRate == null) return 1
    if (b.simpleRate == null) return -1
    return b.simpleRate - a.simpleRate
  })
}

// Top-level entry point: blended XIRR across every asset-type account, plus
// one entry per asset group — each carrying its own pooled XIRR, total
// current value, and a per-account holdings breakdown (sorted best → worst
// annualized return) so the UI can show individual asset performance instead
// of only the group rollup. Holdings with too little cash-flow history for
// XIRR still appear (value-only, rate: null) rather than being dropped — but
// a fully divested account (current value 0, e.g. all shares sold) is left
// out of the displayed holdings/totalValue/accountCount entirely, even
// though its historical cash flows still feed the group's and the blended
// pooled XIRR (a closed position's realized gain is still part of the track
// record, it's just no longer something you're "holding").
export function computeKapapaReturns(accounts, groups, accountTxns, asOfDate = todayISO(), windowMonths = 12) {
  const groupsById = new Map((groups || []).map(g => [g.id, g]))
  const assetGroups = (groups || []).filter(g => g.type === 'asset')
  const assetAccounts = (accounts || []).filter(a => !a.archived && groupsById.get(a.groupId)?.type === 'asset')

  const groupResults = assetGroups
    .map(g => {
      const groupAccounts = assetAccounts.filter(a => a.groupId === g.id)
      if (!groupAccounts.length) return null
      const allHoldings = groupAccounts.map(a =>
        accountHoldingResult(a, accountTxns, accounts, groupsById, asOfDate, windowMonths)
      )
      const flows = allHoldings.filter(h => h.flows).flatMap(h => h.flows)
      const simpleRate = flows.length ? simpleReturn(flows).rate : null
      const xirrRate = flows.length ? xirr(flows) : null
      const currentHoldings = allHoldings.filter(h => h.value > 0)
      return {
        groupId: g.id,
        name: g.name,
        simpleRate,
        xirrRate,
        isPartial: allHoldings.some(h => h.isPartial),
        accountCount: currentHoldings.length,
        totalValue: currentHoldings.reduce((s, h) => s + h.value, 0),
        holdings: currentHoldings,
        flows
      }
    })
    .filter(Boolean)

  const blendedFlows = groupResults.flatMap(g => g.flows)
  const blendedSimple = simpleReturn(blendedFlows)
  const blendedXirrRate = blendedFlows.length ? xirr(blendedFlows) : null
  const blended = {
    hasData: blendedFlows.length > 0,
    simpleRate: blendedSimple.rate,
    multiple: blendedSimple.rate == null ? null : 1 + blendedSimple.rate,
    xirrRate: blendedXirrRate,
    isPartial: groupResults.some(g => g.isPartial),
    accountCount: assetAccounts.length
  }

  const byGroup = groupResults.map(g => ({
    groupId: g.groupId,
    name: g.name,
    hasData: g.simpleRate != null,
    simpleRate: g.simpleRate,
    multiple: g.simpleRate == null ? null : 1 + g.simpleRate,
    xirrRate: g.xirrRate,
    isPartial: g.isPartial,
    accountCount: g.accountCount,
    totalValue: g.totalValue,
    holdings: sortBySimpleRateDesc(g.holdings).map(({ flows, ...rest }) => rest)
  }))

  return { blended, byGroup, hasAssets: assetAccounts.length > 0 }
}
