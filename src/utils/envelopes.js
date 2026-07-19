import { computeIncome } from './pipeline.js'
import { getGrowthPercentForMonth, getBudgetForMonth } from './ledger.js'

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
      target: getBudgetForMonth(allocationMeta[name], monthKey),
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
  // A Growth pool flagged fundsUpkeep is a silent backstop: its share of the
  // surplus never accumulates in its own balance — it's tracked separately as
  // a Balance component of Upkeep instead (Upkeep's Balance = Distribution +
  // this redirected amount - Expenditure), rather than folded into Upkeep's
  // own Distribution figure, so the two stay visible as separate lines.
  const growthFundingUpkeep = {}
  let growthUsedPercent = 0
  for (const name of growthNames) {
    const percent = getGrowthPercentForMonth(growthMeta[name], monthKey)
    const amt = growthPoolAmount * (percent / 100)
    if (growthMeta[name]?.fundsUpkeep) {
      growthDistributed[name] = 0
      growthFundingUpkeep[name] = amt
    } else {
      growthDistributed[name] = amt
    }
    growthUsedPercent += percent
  }
  // Whatever fraction of Growth pools' percentages doesn't add up to 100% sits
  // here unassigned — same money, just not yet routed to a pool.
  const growthUnallocated = growthPoolAmount * (Math.max(0, 100 - growthUsedPercent) / 100)

  return { upkeepDistributed, lifestyleDistributed, growthDistributed, growthFundingUpkeep, growthUnallocated }
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
  const growthFundingUpkeepCum = {}, growthFundingUpkeepThisPeriod = {}
  let growthUnallocatedCum = 0, growthUnallocatedThisPeriod = 0

  for (const m of months) {
    const { upkeepDistributed, lifestyleDistributed, growthDistributed, growthFundingUpkeep, growthUnallocated } = cascadeForMonth(ledger, m)
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
    for (const [name, amt] of Object.entries(growthFundingUpkeep)) {
      growthFundingUpkeepCum[name] = (growthFundingUpkeepCum[name] || 0) + amt
      if (monthInPeriod(m)) growthFundingUpkeepThisPeriod[name] = (growthFundingUpkeepThisPeriod[name] || 0) + amt
    }
    growthUnallocatedCum += growthUnallocated
    if (monthInPeriod(m)) growthUnallocatedThisPeriod += growthUnallocated
  }

  const growthMeta = ledger?.categoryMeta?.growth || {}
  const flaggedGrowthNames = (ledger?.categories?.growth || []).filter(n => !!growthMeta[n]?.fundsUpkeep)

  // A fundsUpkeep pool's real spend (e.g. legacy transactions recorded before
  // it was flagged) counts against Upkeep's spend too, not its own — the pool
  // no longer keeps an independent balance once flagged.
  const upkeepSpentTotal = sumTxn('expense', null, thruPeriod)
    + flaggedGrowthNames.reduce((s, name) => s + sumTxn('growth', name, thruPeriod), 0)
  const upkeepSpentThisPeriod = sumTxn('expense', null, inPeriod)
    + flaggedGrowthNames.reduce((s, name) => s + sumTxn('growth', name, inPeriod), 0)
  const upkeepFundedByGrowthCum = flaggedGrowthNames.reduce((s, name) => s + (growthFundingUpkeepCum[name] || 0), 0)
  const upkeepFundedByGrowthThisPeriod = flaggedGrowthNames.reduce((s, name) => s + (growthFundingUpkeepThisPeriod[name] || 0), 0)
  // A fundsUpkeep pool's own Balance is frozen at its Opening Balance (see
  // `growth` below) rather than accumulating — that standing reserve is a
  // live backstop for Upkeep, not a one-time transfer, so it's folded into
  // Upkeep's Balance on every recompute (not just the monthly redirected
  // slice), the same way it stays folded into the pool's own frozen Balance.
  const upkeepFundedByGrowthReserve = flaggedGrowthNames.reduce((s, name) => s + Number(growthMeta[name]?.openingBalance || 0), 0)
  // Balance = Distribution (Upkeep's own budget-based cascade) + the flagged
  // Growth pool's redirected amount + its standing reserve - Expenditure.
  // All feed the same rolling Balance, but stay separate, individually-displayed
  // lines going in.
  const upkeepBalance = upkeepDistributedCum + upkeepFundedByGrowthCum + upkeepFundedByGrowthReserve - upkeepSpentTotal
  const upkeep = {
    distributedThisPeriod: upkeepDistributedThisPeriod,
    fundedByGrowthThisPeriod: upkeepFundedByGrowthThisPeriod,
    spentThisPeriod: upkeepSpentThisPeriod,
    spentTotal: upkeepSpentTotal,
    balance: upkeepBalance,
    broughtForward: upkeepBalance - (upkeepDistributedThisPeriod + upkeepFundedByGrowthThisPeriod) + upkeepSpentThisPeriod
  }

  const allocationMetaForBudget = ledger?.categoryMeta?.allocation || {}
  const lifestyle = (ledger?.categories?.allocation || []).map(name => {
    const spentTotal = sumTxn('allocation', name, thruPeriod)
    const spentThisPeriod = sumTxn('allocation', name, inPeriod)
    const distributedThisPeriod = lifestyleThisPeriod[name] || 0
    // Opening Balance is a one-time correction for money that already existed
    // in a bucket before this app started tracking distributions — it's just
    // added on top of the cascade math rather than requiring backfilled txns.
    const openingBalance = Number(allocationMetaForBudget[name]?.openingBalance || 0)
    const balance = openingBalance + (lifestyleCum[name] || 0) - spentTotal
    return {
      name,
      budget: getBudgetForMonth(allocationMetaForBudget[name], cutoffMonth),
      distributedThisPeriod,
      spentThisPeriod,
      spentTotal,
      balance,
      broughtForward: balance - distributedThisPeriod + spentThisPeriod
    }
  })

  const growth = (ledger?.categories?.growth || []).map(name => {
    const fundsUpkeep = !!growthMeta[name]?.fundsUpkeep
    const spentTotal = sumTxn('growth', name, thruPeriod)
    const spentThisPeriod = sumTxn('growth', name, inPeriod)
    const distributedThisPeriod = growthThisPeriod[name] || 0
    const openingBalance = Number(growthMeta[name]?.openingBalance || 0)
    // A fundsUpkeep pool's growthCum is always 0 (its share is redirected to
    // Upkeep at the cascade level), and its spend counts against Upkeep too —
    // so its own Balance is frozen at just its Opening Balance.
    const balance = fundsUpkeep ? openingBalance : openingBalance + (growthCum[name] || 0) - spentTotal
    return {
      name,
      percent: getGrowthPercentForMonth(growthMeta[name], cutoffMonth),
      distributedThisPeriod,
      spentThisPeriod,
      spentTotal,
      balance,
      broughtForward: balance - distributedThisPeriod + spentThisPeriod,
      fundsUpkeep,
      redirectedToUpkeepThisPeriod: growthFundingUpkeepThisPeriod[name] || 0
    }
  })

  const growthUsedPercent = growth.reduce((s, p) => s + p.percent, 0)
  const growthUnallocated = {
    percent: Math.max(0, 100 - growthUsedPercent),
    distributedThisPeriod: growthUnallocatedThisPeriod,
    balance: growthUnallocatedCum,
    broughtForward: growthUnallocatedCum - growthUnallocatedThisPeriod
  }

  return { upkeep, lifestyle, growth, growthUnallocated }
}
