import { calculateAssetMetrics } from "./src/money.js";

const account = { id: 1, name: "CRDB Shares" };
const accountTxns = [
  { accountId: 1, kind: "purchase", quantity: 3594, amount: 5858755, direction: "in", date: "2025-12-28", unitPrice: 1630.15 },
  { accountId: 1, kind: "valuation", amount: 2488, direction: "in", date: "2026-02-10", unitPrice: 2488 },
  { accountId: 1, kind: "sale", quantity: 3594, amount: 8940910, direction: "out", date: "2026-02-10", unitPrice: 2488 }
];

const base = 5858755 + 2488 - 8940910;
const info = calculateAssetMetrics(account, accountTxns, "asset");
const uninvestedCash = base - (info.costBasis || 0) + (info.realizedGain || 0);
console.log("Calculated Balance:", (info.value || 0) + uninvestedCash);
console.log("Details:", { base, costBasis: info.costBasis, realizedGain: info.realizedGain, infoValue: info.value });
