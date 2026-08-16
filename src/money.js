export function uid() {
  return Math.random().toString(36).substring(2, 9)
}

export function calculateBucketSpentYTD(subId, accountTxns) {
  const year = String(new Date().getFullYear())
  return accountTxns
    .filter(t => t.subAccountId === subId && t.direction === 'out' && String(t.date || '').startsWith(year))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)
}

export function fmtTZS(amount) {
  const n = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n)
  } catch {
    return Math.round(n).toLocaleString()
  }
}

export function daysBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const ms = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.max(0, Math.floor(ms / 86400000));
}

export function monthsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export function monthKey(dStr) {
  const d = new Date(dStr)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtCompact(amount) {
  const n = Number(amount || 0);
  if (Math.abs(n) >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1) + 'B';
  }
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M';
  }
  return fmtTZS(amount);
}

/**
 * Calculates asset metrics including Cost Basis, Market Value, and Realized Gains.
 * Uses Weighted Average Cost (WAC) method.
 *
 * @param {Object} account - The account object
 * @param {Array} accountTxns - All account transactions (will be filtered for this account)
 * @param {Object} group - The group object (to check if type is 'asset')
 * @returns {Object} { hasData, qty, unitPrice, costBasis, marketValue, value, realizedGain, realizedGains: [] }
 */
export function calculateAssetMetrics(account, accountTxns, groupType, dateLimit = null) {
  if (groupType !== "asset") return { hasData: false };

  let txns = accountTxns.filter((t) => t.accountId === account.id);
  if (dateLimit) {
    txns = txns.filter(t => t.date <= dateLimit);
  }
  const purchases = txns.filter((t) => t.kind === "purchase");
  const sales = txns.filter((t) => t.kind === "sale");
  const valuations = txns
    .filter((t) => t.kind === "valuation")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Calculate Weighted Average Cost and Uninvested Cash
  const sortedTxns = txns.sort((a, b) => (a.date > b.date ? 1 : -1));
  let runningQty = 0;
  let runningCost = 0;
  let totalRealizedGain = 0;
  let uninvestedCash = 0;
  const realizedGains = []; // { date, amount }

  for (const t of sortedTxns) {
    if (t.kind === "purchase") {
      const q = Number(t.quantity || 0);
      const cost = Number(t.amount || 0); // Amount matches total + fee
      runningQty += q;
      runningCost += cost;
    } else if (t.kind === "sale") {
      const q = Number(t.quantity || 0);
      const proceeds = Number(t.amount || 0);
      if (runningQty > 0) {
        const avg = runningCost / runningQty;
        // WAC logic
        const costOfSold = avg * q;
        runningCost -= costOfSold;
        runningQty -= q;

        const gain = proceeds - costOfSold;
        totalRealizedGain += gain;
        realizedGains.push({
          date: t.date,
          amount: gain,
          accountId: account.id,
          symbol: account.name,
          category: t.category || 'Capital Gains'
        });
      }
    } else if (t.kind !== "valuation") {
      // General cash movements (transfers, deposits, adjustments)
      const amt = Number(t.amount || 0);
      if (t.direction === "in") {
        uninvestedCash += amt;
      } else if (t.direction === "out") {
        uninvestedCash -= amt;
      }
    }
  }

  const avgPrice = runningQty > 0 ? runningCost / runningQty : 0;
  const qty = runningQty;

  const latestVal = valuations.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);
  const latestPurchase = purchases.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);
  const latestSale = sales.reduce((acc, t) => (!acc || t.date >= acc.date ? t : acc), null);

  // Pick the most recent price event across valuations, sales, and purchases
  const priceEvents = [latestVal, latestSale, latestPurchase].filter(Boolean);
  const latestPriceEvent = priceEvents.reduce(
    (best, t) => (!best || t.date > best.date ? t : best),
    null
  );
  const unit = latestPriceEvent?.unit || "";
  const unitPrice = Number(latestPriceEvent?.unitPrice || avgPrice || 0);

  return {
    hasData: true,
    qty: Math.max(qty, 0),
    unit,
    unitPrice,
    avgPrice: Math.max(0, avgPrice),
    costBasis: Math.max(0, runningCost) + uninvestedCash, // Accounting Value + Cash
    marketValue: (unitPrice * Math.max(qty, 0)) + uninvestedCash, // Market Value + Cash
    value: (unitPrice * Math.max(qty, 0)) + uninvestedCash, // Backward compat
    uninvestedCash,
    realizedGain: totalRealizedGain,
    realizedGains // Array of { date, amount }
  };
}

/**
 * Calculates current lending metrics for a savings account.
 * Lent = (Transfers OUT to Loan accounts) - (Transfers IN from Loan accounts)
 */
export function calculateSavingsMetrics(account, accountTxns, allAccounts, actualBalance) {
  const txns = accountTxns.filter(t => t.accountId === account.id && t.kind === 'txn');
  let netLent = 0;

  for (const t of txns) {
    if (t.relatedAccountId) {
      const related = allAccounts.find(a => a.id === t.relatedAccountId);
      // Check if related account is a loan-type account
      if (related && (related.groupType === 'loan' || related.type === 'loan')) {
        const amt = Number(t.amount || 0);
        if (t.direction === 'out') netLent += amt;
        else if (t.direction === 'in') netLent -= amt;
      }
    }
  }

  // Use the calculated liquid balance passed from the UI
  const owned = Number(actualBalance || 0);

  // Sum up planned expenses and budgets
  const plans = Array.isArray(account.plans) ? account.plans : [];
  const planned = plans.reduce((s, p) => s + Number(p.amount || 0), 0);

  return {
    owned,
    lent: Math.max(0, netLent), // Ensure we don't show negative lending
    planned,
    total: owned + Math.max(0, netLent)
  };
}

export function computeAccruedForAccount(account, accountTxns, balanceType = 'current') {
  const creditEntries = accountTxns.filter((t) => t.accountId === account.id && t.kind === "credit");
  const today = new Date().toISOString().slice(0, 10);
  let accrued = 0;
  creditEntries.forEach((t) => {
    if (balanceType === 'current' && t.date > today) return;
    const rate = Number(t.creditRate || 0) / 100;
    if (!rate || !t.interestStartDate || t.creditType === "none") return;
    const start = t.interestStartDate;
    if (t.creditType === "compound") {
      const months = monthsBetween(start, today);
      const monthlyRate = rate / 12;
      const compounded = Number(t.amount || 0) * Math.pow(1 + monthlyRate, months);
      const monthStart = new Date(start);
      monthStart.setMonth(monthStart.getMonth() + months);
      const remDays = daysBetween(monthStart.toISOString().slice(0, 10), today);
      const dailyRate = rate / 365;
      accrued += compounded * dailyRate * remDays + (compounded - Number(t.amount || 0));
    } else {
      const days = daysBetween(start, today);
      accrued += Number(t.amount || 0) * rate * (days / 365);
    }
  });
  return accrued;
}

/**
 * Computes an account's balance from its transactions, mirroring the ledger
 * logic used across Accounts/AccountDetail/Kapapa so all three stay in sync.
 */
export function computeAccountBalance(account, accountTxns, groups, balanceType = 'current', ignoreLedgerFilter = false) {
  const today = new Date().toISOString().slice(0, 10);
  const subs = Array.isArray(account.subAccounts) ? account.subAccounts : [];

  const getBaseBalance = (acc) => {
    let b = Number(acc.balance || 0);
    if (balanceType === 'current') {
      const futureTxns = accountTxns.filter(t => t.accountId === acc.id && t.date > today);
      futureTxns.forEach(t => {
        const amt = Number(t.amount || 0);
        if (t.direction === 'out') b += amt;
        else if (t.direction === 'in') b -= amt;
      });
    }
    return b;
  };

  const base = subs.length > 0
    ? subs.reduce((s, sub) => s + getBaseBalance(sub), 0)
    : getBaseBalance(account);

  const group = groups.find((g) => g.id === account.groupId);
  const groupType = account.accountType || group?.type;

  // Fixed: Savings accounts should sum their transactions (Allocations, etc)
  if (group?.metaCategory === 'savings') {
    if (subs.length > 0) return base;
    let cleanBase = 0;
    const txns = accountTxns.filter(t => t.accountId === account.id);
    for (const t of txns) {
      if (balanceType === 'current' && t.date > today) continue;
      const amt = Number(t.amount || 0);
      if (t.direction === 'in') cleanBase += amt;
      if (t.direction === 'out') cleanBase -= amt;
    }
    return cleanBase;
  }

  if (groupType === "credit") return base + computeAccruedForAccount(account, accountTxns, balanceType);

  if (groupType === "asset") {
    // If account has subaccounts, trust the base sum (which filters subs by ledger)
    if (subs.length > 0) return base;

    // Fix ledger corruption: Dynamically calculate raw base from valid cash-flow transactions
    let cleanBase = 0;
    const txns = accountTxns.filter(t => t.accountId === account.id);
    for (const t of txns) {
      if (t.kind === 'valuation') continue;
      if (balanceType === 'current' && t.date > today) continue;
      const amt = Number(t.amount || 0);
      if (t.direction === 'in') cleanBase += amt;
      if (t.direction === 'out') cleanBase -= amt;
    }

    const info = calculateAssetMetrics(account, accountTxns, groupType, balanceType === 'current' ? today : null);
    if (info.hasData) {
      const uninvestedCash = cleanBase - (info.costBasis || 0) + (info.realizedGain || 0);
      return (info.value || 0) + uninvestedCash;
    }
  }

  return base;
}
