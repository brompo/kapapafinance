import { computeIncome } from './pipeline.js'

// Distribution is automatic: whenever Income is recognized (a Collection), it
// cascades through Upkeep (sum of Expense budgets) -> Lifestyle buckets (priority
// order, each capped by its own budget) -> Growth pools (split by percent of
// whatever's left) — same math as the original budget cascade, just computed fresh
// for each month of history so it can feed a rolling Balance. None of this touches
// any real Account — only real Expenditures (and, for Growth, a manual virtual
// Withdrawal) do that.
function cascadeForMonth(ledger, monthKey) {
  const monthTxns = (ledger?.txns || []).filter(t => (t.date || '').startsWith(monthKey))
  const { income } = computeIncome(monthTxns)
  let available = Math.max(0, income)

  const expenseCats = ledger?.categories?.expense || []
  const expenseMeta = ledger?.categoryMeta?.expense || {}
  const upkeepTarget = expenseCats.reduce((s, name) => s + Number(expenseMeta[name]?.budget || 0), 0)
  const upkeepDistributed = Math.min(upkeepTarget, available)
  available -= upkeepDistributed

  const bucketNames = ledger?.categories?.allocation || []
  const allocationMeta = ledger?.categoryMeta?.allocation || {}
  const buckets = bucketNames
    .map(name => ({
      name,
      target: Number(allocationMeta[name]?.budget || 0),
      priority: Number.isFinite(Number(allocationMeta[name]?.priority)) ? Number(allocationMeta[name].priority) : Infinity
    }))
    .sort((a, b) => a.priority - b.priority)

  const lifestyleDistributed = {}
  for (const b of buckets) {
    const amt = Math.min(b.target, available)
    lifestyleDistributed[b.name] = amt
    available -= amt
  }

  const growthPoolAmount = available
  const growthNames = ledger?.categories?.growth || []
  const growthMeta = ledger?.categoryMeta?.growth || {}
  const growthDistributed = {}
  for (const name of growthNames) {
    const percent = Number(growthMeta[name]?.percent || 0)
    growthDistributed[name] = growthPoolAmount * (percent / 100)
  }

  return { upkeepDistributed, lifestyleDistributed, growthDistributed }
}

// `period` is either a month key ("2026-07") or a year key ("2026") — its length
// (7 vs 4) tells us which. "This period" figures match on that prefix; the
// cumulative Balance always cuts off at the end of that period's last month,
// since Balance rolls over regardless of which granularity you're viewing.
export function computeEnvelopeSummary(ledger, period) {
  const txns = ledger?.txns || []
  const envelopes = ledger?.envelopes || [] // only ever holds Growth Withdrawal events now
  const cutoffMonth = period.length === 4 ? `${period}-12` : period
  const inPeriod = (d) => !!d && d.slice(0, period.length) === period
  const thruPeriod = (d) => !!d && d.slice(0, 7) <= cutoffMonth
  const monthInPeriod = (m) => m.slice(0, period.length) === period

  const sumTxn = (type, category, dateFilter) =>
    txns
      .filter(t => t.type === type && (category == null || t.category === category) && dateFilter(t.date))
      .reduce((s, t) => s + Number(t.amount || 0), 0)

  const sumWithdrawn = (name, dateFilter) =>
    envelopes
      .filter(e => e.categoryType === 'growth' && e.category === name && e.kind === 'withdraw' && dateFilter(e.date))
      .reduce((s, e) => s + Number(e.amount || 0), 0)

  // Only months that actually recognized some income can contribute a non-zero
  // cascade result, so this is safe to use as the full set of months to sum.
  const months = [...new Set(
    txns
      .filter(t => (t.type === 'collection' || (t.type === 'income' && !t.reimbursementOf)) && t.date)
      .map(t => t.date.slice(0, 7))
  )].filter(m => m <= cutoffMonth).sort()

  let upkeepDistributedCum = 0
  let upkeepDistributedThisPeriod = 0
  const lifestyleCum = {}, lifestyleThisPeriod = {}
  const growthCum = {}, growthThisPeriod = {}

  for (const m of months) {
    const { upkeepDistributed, lifestyleDistributed, growthDistributed } = cascadeForMonth(ledger, m)
    upkeepDistributedCum += upkeepDistributed
    if (monthInPeriod(m)) upkeepDistributedThisPeriod += upkeepDistributed
    for (const [name, amt] of Object.entries(lifestyleDistributed)) {
      lifestyleCum[name] = (lifestyleCum[name] || 0) + amt
      if (monthInPeriod(m)) lifestyleThisPeriod[name] = (lifestyleThisPeriod[name] || 0) + amt
    }
    for (const [name, amt] of Object.entries(growthDistributed)) {
      growthCum[name] = (growthCum[name] || 0) + amt
      if (monthInPeriod(m)) growthThisPeriod[name] = (growthThisPeriod[name] || 0) + amt
    }
  }

  const upkeepSpentTotal = sumTxn('expense', null, thruPeriod)
  const upkeep = {
    distributedThisPeriod: upkeepDistributedThisPeriod,
    spentThisPeriod: sumTxn('expense', null, inPeriod),
    spentTotal: upkeepSpentTotal,
    balance: upkeepDistributedCum - upkeepSpentTotal
  }

  const lifestyle = (ledger?.categories?.allocation || []).map(name => {
    const spentTotal = sumTxn('allocation', name, thruPeriod)
    return {
      name,
      distributedThisPeriod: lifestyleThisPeriod[name] || 0,
      spentThisPeriod: sumTxn('allocation', name, inPeriod),
      spentTotal,
      balance: (lifestyleCum[name] || 0) - spentTotal
    }
  })

  const growth = (ledger?.categories?.growth || []).map(name => {
    const withdrawnTotal = sumWithdrawn(name, thruPeriod)
    return {
      name,
      distributedThisPeriod: growthThisPeriod[name] || 0,
      withdrawnThisPeriod: sumWithdrawn(name, inPeriod),
      withdrawnTotal,
      balance: (growthCum[name] || 0) - withdrawnTotal
    }
  })

  return { upkeep, lifestyle, growth }
}
