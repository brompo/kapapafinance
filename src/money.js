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
export function calculateAssetMetrics(account, accountTxns, groupType) {
  if (groupType !== "asset") return { hasData: false };

  const txns = accountTxns.filter((t) => t.accountId === account.id);
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

  const unit = latestVal?.unit || latestSale?.unit || latestPurchase?.unit || "";
  const unitPrice = Number(
    latestVal?.unitPrice ||
    latestSale?.unitPrice ||
    avgPrice ||
    0
  );

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
