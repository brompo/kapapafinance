export function collectionStatus(t) {
  const amount = Number(t.amount || 0)
  const needsCompliance = !!t.needsCompliance
  const pending = needsCompliance && (t.complianceAmount === '' || t.complianceAmount == null)
  const complianceAmount = pending ? 0 : Number(t.complianceAmount || 0)
  const net = pending ? 0 : needsCompliance ? amount - complianceAmount : amount
  return { pending, complianceAmount, net }
}

// Recognizes this month's Income from Collections (net of any pending compliance
// hold), falling back to legacy plain 'income' entries when no Collections exist
// yet. Distribution/spend tracking lives in src/utils/envelopes.js instead — this
// is just income recognition.
export function computeIncome(filteredTxns) {
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

  return { collectionRows, totalCollected, complianceHeld, income, isLegacyFallback }
}
