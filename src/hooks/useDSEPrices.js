import { useState, useEffect, useCallback } from "react";

const PRICES_URL = "./data/dse-prices.json";
const HISTORY_URL = "./data/dse-history.json";
const CACHE_KEY = "dse_prices_cache";
const HISTORY_CACHE_KEY = "dse_history_cache";
const STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > STALE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — ignore */ }
}

export function useDSEPrices() {
  const [prices, setPrices] = useState(() => readCache(CACHE_KEY));
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(!prices);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(PRICES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPrices(data);
      writeCache(CACHE_KEY, data);
      setError(null);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const cached = readCache(HISTORY_CACHE_KEY);
    if (cached) {
      setHistory(cached);
      return cached;
    }
    try {
      const res = await fetch(HISTORY_URL);
      if (!res.ok) return null;
      const data = await res.json();
      setHistory(data);
      writeCache(HISTORY_CACHE_KEY, data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const getPrice = useCallback(
    (symbol) => {
      if (!prices?.companies) return null;
      return prices.companies.find(
        (c) => c.symbol.toUpperCase() === symbol.toUpperCase()
      ) || null;
    },
    [prices]
  );

  return { prices, history, loading, error, fetchPrices, fetchHistory, getPrice };
}

/**
 * Match a share account name to a DSE symbol.
 * Handles names like "CRDB Bank", "CRDB", "NMB Bank", "NMB", etc.
 */
export function matchAccountToDSE(accountName, dseCompanies) {
  if (!accountName || !dseCompanies?.length) return null;
  const name = accountName.toUpperCase().trim();

  // Direct symbol match first
  const exact = dseCompanies.find((c) => c.symbol === name);
  if (exact) return exact;

  // Check if account name starts with a known symbol
  const startsWith = dseCompanies.find(
    (c) => name.startsWith(c.symbol + " ") || name.startsWith(c.symbol + "-")
  );
  if (startsWith) return startsWith;

  // Check if account name contains the symbol as a word
  const contains = dseCompanies.find((c) =>
    name.split(/[\s\-_]+/).includes(c.symbol)
  );
  if (contains) return contains;

  // Check if DSE company name is contained in the account name
  const nameMatch = dseCompanies.find((c) =>
    name.includes(c.name.toUpperCase().split(" ")[0])
  );
  if (nameMatch) return nameMatch;

  return null;
}

/**
 * Build auto-valuation entries for share accounts whose price
 * has changed since the last valuation. Returns an array of
 * { accountId, unitPrice, symbol } objects — the caller decides
 * whether to persist them.
 */
export function buildAutoValuations(accounts, accountTxns, dseCompanies) {
  if (!dseCompanies?.length) return [];

  const updates = [];
  const shareAccounts = accounts.filter((a) => a.groupType === "asset");

  for (const acct of shareAccounts) {
    const match = matchAccountToDSE(acct.name, dseCompanies);
    if (!match || !match.price) continue;

    // Find the latest price event for this account
    const txns = accountTxns
      .filter((t) => t.accountId === acct.id && (t.kind === "valuation" || t.kind === "purchase" || t.kind === "sale"))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const latest = txns[txns.length - 1];
    const currentUnitPrice = latest ? Number(latest.unitPrice || 0) : 0;

    // Only create valuation if price actually changed
    if (Math.abs(currentUnitPrice - match.price) < 0.01) continue;

    updates.push({
      accountId: acct.id,
      unitPrice: match.price,
      symbol: match.symbol,
    });
  }

  return updates;
}
