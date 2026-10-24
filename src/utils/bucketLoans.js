// Bucket-to-bucket transfers (book.transfers) can optionally be loans:
//   { isLoan: true, repaid, dueDate? }            — the lending move itself
//   { repaysLoanId }                              — a repayment, itself a plain reverse move
// Money still moves purely by shifting each bucket's openingBalance; a loan
// just adds bookkeeping so "who owes whom" is visible and repayable.

export const loanOutstanding = (tr) => Math.max(0, Number(tr.amount || 0) - Number(tr.repaid || 0))

export const getOpenLoans = (transfers) =>
  (Array.isArray(transfers) ? transfers : []).filter(tr => tr.isLoan && loanOutstanding(tr) > 0)

// What a bucket is owed (lent out) and owes (borrowed) across open loans.
export function bucketLoanTotals(transfers, type, name) {
  let lent = 0, borrowed = 0
  for (const l of getOpenLoans(transfers)) {
    if (l.fromType === type && l.fromName === name) lent += loanOutstanding(l)
    if (l.toType === type && l.toName === name) borrowed += loanOutstanding(l)
  }
  return { lent, borrowed }
}

// Returns a new categoryMeta with `amt` moved from one bucket's openingBalance
// to another's. A negative amt moves it the other way (used to reverse).
export function shiftOpening(categoryMeta, fromType, fromName, toType, toName, amt) {
  const next = { ...categoryMeta }
  const fromMeta = next[fromType]?.[fromName] || {}
  next[fromType] = {
    ...next[fromType],
    [fromName]: { ...fromMeta, openingBalance: Number(fromMeta.openingBalance || 0) - amt }
  }
  const toMeta = next[toType]?.[toName] || {}
  next[toType] = {
    ...next[toType],
    [toName]: { ...toMeta, openingBalance: Number(toMeta.openingBalance || 0) + amt }
  }
  return next
}
