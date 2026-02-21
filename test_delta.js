const allAccounts = [
  {
    id: 'A1',
    balance: 0,
    subAccounts: [
      { id: 'S1', balance: 50 },
      { id: 'S2', balance: 100 }
    ]
  }
];

function applyAccountDelta(nextAccounts, accountId, subAccountId, delta) {
  return nextAccounts.map(a => {
    if (a.id !== accountId) return a
    const subs = Array.isArray(a.subAccounts) ? a.subAccounts : []
    if (!subs.length) return { ...a, balance: Number(a.balance || 0) + delta }
    const nextSubs = subs.map(s => (
      s.id === subAccountId ? { ...s, balance: Number(s.balance || 0) + delta } : s
    ))
    return { ...a, subAccounts: nextSubs }
  })
}

// simulate moving 100 from S1 to S2
let nextAccounts = applyAccountDelta(allAccounts, 'A1', 'S1', -100);
nextAccounts = applyAccountDelta(nextAccounts, 'A1', 'S2', 100);

console.log(JSON.stringify(nextAccounts, null, 2));
