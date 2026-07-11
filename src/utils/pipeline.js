import { GROWTH_POOL_DEFS } from './ledger.js'

export function collectionStatus(t) {
  const amount = Number(t.amount || 0)
  const needsCompliance = !!t.needsCompliance
  const pending = needsCompliance && (t.complianceAmount === '' || t.complianceAmount == null)
  const complianceAmount = pending ? 0 : Number(t.complianceAmount || 0)
  const net = pending ? 0 : needsCompliance ? amount - complianceAmount : amount
  return { pending, complianceAmount, net }
}

// Pure derivation of the 5-stage pipeline for one month's filtered ledger transactions.
// Nothing here is persisted — Collections are the only real transactions; everything
// downstream is recomputed live from Collections + the ledger's pipeline/bucket config.
export function computePipeline(filteredTxns, ledger, month) {
  const realCollections = filteredTxns.filter(t => t.type === 'collection')
  const legacyIncome = filteredTxns.filter(t => t.type === 'income' && !t.reimbursementOf)
  const isLegacyFallback = realCollections.length === 0 && legacyIncome.length > 0

  const effectiveCollections = realCollections.length > 0
    ? realCollections
    : legacyIncome.map(t => ({ ...t, needsCompliance: false, complianceAmount: 0, _legacy: true }))

  const collectionRows = effectiveCollections.map(t => {
    const { pending, complianceAmount, net } = collectionStatus(t)
    return { ...t, pending, complianceAmount, net }
  })

  const totalCollected = collectionRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const complianceHeld = collectionRows.reduce((s, r) => s + (r.pending ? 0 : r.complianceAmount), 0)
  const income = collectionRows.reduce((s, r) => s + r.net, 0)

  // Upkeep's real deduction is actual spend against the Expense categories (Food,
  // Transportation, ...) — the target is kept only as a budget to compare against.
  const upkeepTarget = Number(ledger?.pipeline?.upkeepTarget || 0)
  const upkeepActual = filteredTxns.reduce((s, t) => {
    if (t.type !== 'expense') return s
    const reimbursed = (t.reimbursedBy || []).reduce((rs, r) => rs + Number(r.amount || 0), 0)
    return s + Number(t.amount || 0) - reimbursed
  }, 0)
  const remainder = income - upkeepActual

  const bucketNames = ledger?.categories?.allocation || []
  const allocationMeta = ledger?.categoryMeta?.allocation || {}
  const buckets = bucketNames
    .map(name => ({
      name,
      target: Number(allocationMeta[name]?.budget || 0),
      priority: Number.isFinite(Number(allocationMeta[name]?.priority)) ? Number(allocationMeta[name].priority) : Infinity
    }))
    .sort((a, b) => a.priority - b.priority)

  let pool = Math.max(0, remainder)
  const bucketResults = buckets.map(b => {
    const filled = Math.min(b.target, pool)
    pool -= filled
    return { ...b, filled, fullyFunded: b.target > 0 ? filled >= b.target : true }
  })
  const familyHappinessSpent = bucketResults.reduce((s, b) => s + b.filled, 0)
  const allBucketsFunded = bucketResults.every(b => b.fullyFunded)

  const growthSurplus = allBucketsFunded ? pool : 0
  const growthPools = (ledger?.pipeline?.growthPools || GROWTH_POOL_DEFS.map(d => ({ ...d, percent: 0 })))
    .slice()
    .sort((a, b) => a.priority - b.priority)
  const growthResults = growthPools.map(p => ({
    ...p,
    amount: growthSurplus * (Number(p.percent || 0) / 100)
  }))
  const growthPercentTotal = growthPools.reduce((s, p) => s + Number(p.percent || 0), 0)

  return {
    collectionRows,
    totalCollected,
    complianceHeld,
    income,
    upkeepTarget,
    upkeepActual,
    remainder,
    bucketResults,
    familyHappinessSpent,
    allBucketsFunded,
    growthSurplus,
    growthResults,
    growthPercentTotal,
    isLegacyFallback
  }
}
