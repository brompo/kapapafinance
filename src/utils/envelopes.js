import { computeIncome } from './pipeline.js'
import { getGrowthPercentForMonth } from './ledger.js'

// Distribution is automatic: whenever Income is recognized (a Collection), it
// cascades through Upkeep (sum of Expense budgets) -> Lifestyle buckets (priority
// order, each capped by its own budget) -> Growth pools (split by percent of
// whatever's left) — same math as the original budget cascade, just computed fresh
// for each month of history so it can feed a rolling Balance. None of this touches
// any real Account — only real Expenditure (type 'expense'/'allocation'/'growth'
// ledger transactions, entered in Transactions) does that.
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
  let growthUsedPercent = 0
  for (const name of growthNames) {
    const percent = getGrowthPercentForMonth(growthMeta[name], monthKey)
    growthDistributed[name] = growthPoolAmount * (percent / 100)
    growthUsedPercent += percent
  }
  // Whatever fraction of Growth pools' percentages doesn't add up to 100% sits
  // here unassigned — same money, just not yet routed to a pool.
  const growthUnallocated = growthPoolAmount * (Math.max(0, 100 - growthUsedPercent) / 100)

  return { upkeepDistributed, lifestyleDistributed, growthDistributed, growthUnallocated }
}

// `period` is either a month key ("2026-07") or a year key ("2026") — its length
// (7 vs 4) tells us which. "This period" figures match on that prefix; the
// cumulative Balance always cuts off at the end of that period's last month,
// since Balance rolls over regardless of which granularity you're viewing.
export function computeEnvelopeSummary(ledger, period) {
  const txns = ledger?.txns || []
  const cutoffMonth = period.length === 4 ? `${period}-12` : period
  const inPeriod = (d) => !!d && d.slice(0, period.length) === period
  const thruPeriod = (d) => !!d && d.slice(0, 7) <= cutoffMonth
  const monthInPeriod = (m) => m.slice(0, period.length) === period

  const sumTxn = (type, category, dateFilter) =>
    txns
      .filter(t => t.type === type && (category == null || t.category === category) && dateFilter(t.date))
      .reduce((s, t) => s + Number(t.amount || 0), 0)

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
  let growthUnallocatedCum = 0, growthUnallocatedThisPeriod = 0

  for (const m of months) {
    const { upkeepDistributed, lifestyleDistributed, growthDistributed, growthUnallocated } = cascadeForMonth(ledger, m)
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
    growthUnallocatedCum += growthUnallocated
    if (monthInPeriod(m)) growthUnallocatedThisPeriod += growthUnallocated
  }

  const upkeepSpentTotal = sumTxn('expense', null, thruPeriod)
  const upkeep = {
    distributedThisPeriod: upkeepDistributedThisPeriod,
    spentThisPeriod: sumTxn('expense', null, inPeriod),
    spentTotal: upkeepSpentTotal,
    balance: upkeepDistributedCum - upkeepSpentTotal
  }

  const allocationMetaForBudget = ledger?.categoryMeta?.allocation || {}
  const lifestyle = (ledger?.categories?.allocation || []).map(name => {
    const spentTotal = sumTxn('allocation', name, thruPeriod)
    return {
      name,
      budget: Number(allocationMetaForBudget[name]?.budget || 0),
      distributedThisPeriod: lifestyleThisPeriod[name] || 0,
      spentThisPeriod: sumTxn('allocation', name, inPeriod),
      spentTotal,
      balance: (lifestyleCum[name] || 0) - spentTotal
    }
  })

  const growthMetaForPercent = ledger?.categoryMeta?.growth || {}
  const growth = (ledger?.categories?.growth || []).map(name => {
    const spentTotal = sumTxn('growth', name, thruPeriod)
    return {
      name,
      percent: getGrowthPercentForMonth(growthMetaForPercent[name], cutoffMonth),
      distributedThisPeriod: growthThisPeriod[name] || 0,
      spentThisPeriod: sumTxn('growth', name, inPeriod),
      spentTotal,
      balance: (growthCum[name] || 0) - spentTotal
    }
  })

  const growthUsedPercent = growth.reduce((s, p) => s + p.percent, 0)
  const growthUnallocated = {
    percent: Math.max(0, 100 - growthUsedPercent),
    distributedThisPeriod: growthUnallocatedThisPeriod,
    balance: growthUnallocatedCum
  }

  return { upkeep, lifestyle, growth, growthUnallocated }
}
