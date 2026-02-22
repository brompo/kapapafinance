const vault = {
  accounts: [
    {
      id: "acc1",
      balance: 0,
      subAccounts: [
        { id: "sub1", balance: 1000 },
        { id: "sub2", balance: 500 }
      ]
    }
  ],
  accountTxns: [
    { id: "txn1-in", accountId: "acc1", subAccountId: "sub1", direction: "in", amount: 1000, kind: "transfer" },
    { id: "txn1-out", accountId: "acc1", subAccountId: "sub2", direction: "out", amount: 1000, kind: "transfer" }
  ]
};

function applyAccountDelta(nextAccounts, accountId, subAccountId, delta) {
  return nextAccounts.map(a => {
    if (a.id !== accountId) return a;
    const subs = Array.isArray(a.subAccounts) ? a.subAccounts : [];
    if (!subs.length) return { ...a, balance: Number(a.balance || 0) + delta };
    const nextSubs = subs.map(s => (
      s.id === subAccountId ? { ...s, balance: Number(s.balance || 0) + delta } : s
    ));
    return { ...a, subAccounts: nextSubs };
  });
}

function updateAccountTxn(entryId, next) {
  const entry = vault.accountTxns.find(t => t.id === entryId);
  const oldAmt = entry.amount;
  const newAmt = next.amount || oldAmt;
  
  let nextAccounts = vault.accounts;
  
  const baseId = entry.id.replace(/-(in|out)$/, '');
  const pair = vault.accountTxns.find(t => t.id !== entry.id && t.id.startsWith(baseId));

  const newAccountId = next.accountId || entry.accountId;
  const newSubAccountId = next.subAccountId !== undefined ? next.subAccountId : entry.subAccountId;

  const deltaRevertEntry = entry.direction === 'in' ? -oldAmt : oldAmt;
  nextAccounts = applyAccountDelta(nextAccounts, entry.accountId, entry.subAccountId, deltaRevertEntry);

  if (pair) {
    const deltaRevertPair = pair.direction === 'in' ? -oldAmt : oldAmt;
    nextAccounts = applyAccountDelta(nextAccounts, pair.accountId, pair.subAccountId, deltaRevertPair);
  }

  const deltaApplyEntry = entry.direction === 'in' ? newAmt : -newAmt;
  nextAccounts = applyAccountDelta(nextAccounts, newAccountId, newSubAccountId, deltaApplyEntry);

  if (pair) {
    const deltaApplyPair = pair.direction === 'in' ? newAmt : -newAmt;
    nextAccounts = applyAccountDelta(nextAccounts, pair.accountId, pair.subAccountId, deltaApplyPair);
  }

  return nextAccounts;
}

// Edit txn1-in to use sub2 instead of sub1
const newAccounts = updateAccountTxn("txn1-in", { subAccountId: "sub2" });
console.log(JSON.stringify(newAccounts, null, 2));
