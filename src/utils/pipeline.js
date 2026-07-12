export function collectionStatus(t) {
  const amount = Number(t.amount || 0)
  const needsCompliance = !!t.needsCompliance
  const pending = needsCompliance && (t.complianceAmount === '' || t.complianceAmount == null)
  const complianceAmount = pending ? 0 : Number(t.complianceAmount || 0)
  const net = pending ? 0 : needsCompliance ? amount - complianceAmount : amount
  return { pending, complianceAmount, net }
}

// Pure derivation of the Flow budget plan for one month: given this month's
// Income, cascade it through Upkeep -> Lifestyle -> Growth in priority order, each
// segment capped by its own budget/target, so "Allocated" always answers "how much
// of my income is spoken for by this segment" — not "what did I actually spend"
// (real spend tracking lives in the Transactions tab / CategoryDetail instead).
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

  let available = Math.max(0, income)

  // --- Upkeep: sum of each Expense category's budget. If Income covers it, it's
  // allocated in full (100%); otherwise it only gets whatever Income is available. ---
  const expenseCats = ledger?.categories?.expense || []
  const expenseMeta = ledger?.categoryMeta?.expense || {}
  const upkeepTarget = expenseCats.reduce((s, name) => s + Number(expenseMeta[name]?.budget || 0), 0)
  const upkeepAllocated = Math.min(upkeepTarget, available)
  const upkeepPercent = upkeepTarget > 0 ? Math.min(100, (upkeepAllocated / upkeepTarget) * 100) : 100
  available -= upkeepAllocated

  // --- Lifestyle: buckets draw from what's left after Upkeep, in priority order,
  // each capped by its own budget. ---
  const bucketNames = ledger?.categories?.allocation || []
  const allocationMeta = ledger?.categoryMeta?.allocation || {}
  const buckets = bucketNames
    .map(name => ({
      name,
      target: Number(allocationMeta[name]?.budget || 0),
      priority: Number.isFinite(Number(allocationMeta[name]?.priority)) ? Number(allocationMeta[name].priority) : Infinity
    }))
    .sort((a, b) => a.priority - b.priority)

  const bucketResults = buckets.map(b => {
    const allocated = Math.min(b.target, available)
    available -= allocated
    const percent = b.target > 0 ? Math.min(100, (allocated / b.target) * 100) : 100
    return { ...b, allocated, percent }
  })
  const lifestyleTargetTotal = buckets.reduce((s, b) => s + b.target, 0)
  const lifestyleAllocatedTotal = bucketResults.reduce((s, b) => s + b.allocated, 0)

  // --- Growth: whatever's left after Upkeep + Lifestyle, split across pools by
  // their own percent. ---
  const growthPoolAmount = available
  const growthNames = ledger?.categories?.growth || []
  const growthMeta = ledger?.categoryMeta?.growth || {}
  const growthPools = growthNames
    .map(name => ({
      name,
      priority: Number.isFinite(Number(growthMeta[name]?.priority)) ? Number(growthMeta[name].priority) : Infinity,
      percent: Number(growthMeta[name]?.percent || 0)
    }))
    .sort((a, b) => a.priority - b.priority)

  const growthResults = growthPools.map(p => ({
    ...p,
    contributed: growthPoolAmount * (p.percent / 100)
  }))
  const growthContributedTotal = growthResults.reduce((s, p) => s + p.contributed, 0)
  const growthPercentTotal = growthPools.reduce((s, p) => s + Number(p.percent || 0), 0)

  return {
    collectionRows,
    totalCollected,
    complianceHeld,
    income,
    upkeepTarget,
    upkeepAllocated,
    upkeepPercent,
    bucketResults,
    lifestyleTargetTotal,
    lifestyleAllocatedTotal,
    growthPoolAmount,
    growthResults,
    growthContributedTotal,
    growthPercentTotal,
    isLegacyFallback
  }
}
