#!/usr/bin/env node
/**
 * DSE Market Data Scraper
 *
 * Scrapes daily equity prices and fundamentals from dse.co.tz,
 * writes to public/data/dse-prices.json (current snapshot)
 * and appends to public/data/dse-history.json (historical log).
 *
 * Run: node scripts/scrape-dse.mjs
 * Designed to run in a GitHub Action on weekday afternoons (EAT).
 */

import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const PRICES_FILE = path.join(DATA_DIR, "dse-prices.json");
const HISTORY_FILE = path.join(DATA_DIR, "dse-history.json");

// Full DSE company directory (id → ticker + name)
const DSE_COMPANIES = {
  1: { symbol: "DSE", name: "Dar es Salaam Stock Exchange Plc" },
  2: { symbol: "CRDB", name: "CRDB Bank Plc" },
  3: { symbol: "DCB", name: "DCB Commercial Bank Plc" },
  4: { symbol: "EABL", name: "East African Breweries Ltd" },
  5: { symbol: "JHL", name: "Jubilee Holdings Ltd" },
  6: { symbol: "KA", name: "Kenya Airways Ltd" },
  7: { symbol: "KCB", name: "KCB Group Plc" },
  8: { symbol: "MBP", name: "Mkombozi Commercial Bank Plc" },
  9: { symbol: "NICO", name: "NICOL Insurance Co Ltd" },
  10: { symbol: "NMB", name: "NMB Bank Plc" },
  11: { symbol: "NMG", name: "Nation Media Group Ltd" },
  12: { symbol: "PAL", name: "Precision Air Services Plc" },
  13: { symbol: "SWIS", name: "Swissport Tanzania Plc" },
  14: { symbol: "TBL", name: "Tanzania Breweries Ltd" },
  15: { symbol: "TCPLC", name: "Tanzania Cigarette Plc" },
  16: { symbol: "TOL", name: "Tanzania Oxygen Ltd" },
  17: { symbol: "TTP", name: "Tanzania Tea Packers Ltd" },
  18: { symbol: "SWALA", name: "Swala Energy Ltd" },
  19: { symbol: "USL", name: "Uchumi Supermarkets Ltd" },
  20: { symbol: "MKCB", name: "Mkuki Commercial Bank Plc" },
  21: { symbol: "MCB", name: "Mwalimu Commercial Bank Plc" },
  22: { symbol: "YETU", name: "Yetu Microfinance Bank Plc" },
  23: { symbol: "MUCOBA", name: "Mufindi Community Bank Plc" },
  24: { symbol: "VODA", name: "Vodacom Tanzania Plc" },
  25: { symbol: "AFRIPRISE", name: "Afriprise Holdings Ltd" },
  26: { symbol: "JATU", name: "Jatu Plc" },
  27: { symbol: "TCC", name: "Tanzania Cement Company Plc" },
  28: { symbol: "TPCC", name: "Tanzania Portland Cement Plc" },
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "KapapaFinance/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── Parse the homepage equity watch table ──────────────────────────
function parseEquityTable(html) {
  const shares = [];

  // The equity table has rows with: Symbol, Open, PrevClose, Close, High, Low, Change, Turnover, Deals, ...
  // We look for <tr> rows inside the equity watch table
  const tableMatch = html.match(/<table[^>]*class="[^"]*equity[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*id="[^"]*equity[^"]*"[^>]*>([\s\S]*?)<\/table>/i);

  // Fallback: find all table rows that contain known DSE symbols
  const knownSymbols = Object.values(DSE_COMPANIES).map((c) => c.symbol);
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell;
    while ((cell = cellRegex.exec(row)) !== null) {
      cells.push(cell[1].replace(/<[^>]+>/g, "").trim());
    }

    if (cells.length < 6) continue;

    const sym = cells[0].toUpperCase().trim();
    if (!knownSymbols.includes(sym)) continue;

    const parseNum = (s) => {
      if (!s) return 0;
      const n = Number(s.replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    shares.push({
      symbol: sym,
      open: parseNum(cells[1]),
      prevClose: parseNum(cells[2]),
      close: parseNum(cells[3]),
      high: parseNum(cells[4]),
      low: parseNum(cells[5]),
      change: parseNum(cells[6]),
      turnover: parseNum(cells[7]),
      deals: parseNum(cells[8]),
      volume: parseNum(cells[9] || cells[8]),
      marketCap: parseNum(cells[10] || "0"),
    });
  }

  return shares;
}

// ── Parse a company profile page for fundamentals ──────────────────
function parseProfilePage(html) {
  const data = {};

  const extract = (label) => {
    try {
      const re = new RegExp(label + "[\\s:]*<[^>]*>([^<]+)", "i");
      const m = html.match(re);
      if (m?.[1]) return m[1].replace(/,/g, "").trim();
      const re2 = new RegExp("<t[dh][^>]*>[^<]*" + label + "[^<]*<\\/t[dh]>\\s*<t[dh][^>]*>([^<]+)", "i");
      const m2 = html.match(re2);
      return m2?.[1] ? m2[1].replace(/,/g, "").trim() : null;
    } catch {
      return null;
    }
  };

  const num = (v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  };

  data.pe = num(extract("P\\/E|P/E|Price.?Earnings"));
  data.eps = num(extract("EPS|Earnings.?Per.?Share"));
  data.dividendYield = num(extract("Dividend.?Yield"));
  data.dividendPerShare = num(extract("Dividend.?Per.?Share|DPS"));
  data.bookValue = num(extract("Book.?Value|NAV"));
  data.pb = num(extract("P\\/B|P/B|Price.?Book"));
  data.sharesOutstanding = num(extract("Shares.?Outstanding|Total.?Shares|Authorized.?Shares"));

  return data;
}

// ── Main scrape flow ───────────────────────────────────────────────
async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[DSE Scraper] ${today} — fetching homepage…`);

  const homepage = await fetch("https://dse.co.tz");
  const equityData = parseEquityTable(homepage);

  console.log(`[DSE Scraper] Parsed ${equityData.length} shares from equity table`);

  if (equityData.length === 0) {
    console.warn("[DSE Scraper] No equity data found — DSE site may have changed structure.");
    console.warn("[DSE Scraper] Writing empty snapshot so the app knows scraping was attempted.");
  }

  // Fetch fundamentals for each company profile
  const fundamentals = {};
  for (const [id, company] of Object.entries(DSE_COMPANIES)) {
    try {
      console.log(`  → ${company.symbol} profile…`);
      const profileHtml = await fetch(`https://dse.co.tz/listed/company/profile?id=${id}`);
      fundamentals[company.symbol] = parseProfilePage(profileHtml);
      // Small delay to be polite
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn(`  ✗ ${company.symbol}: ${err.message}`);
      fundamentals[company.symbol] = {};
    }
  }

  // Build the current snapshot
  const snapshot = {
    date: today,
    scrapedAt: new Date().toISOString(),
    companies: Object.values(DSE_COMPANIES).map((company) => {
      const eq = equityData.find((e) => e.symbol === company.symbol) || {};
      const fund = fundamentals[company.symbol] || {};
      return {
        symbol: company.symbol,
        name: company.name,
        price: eq.close || eq.prevClose || 0,
        open: eq.open || 0,
        prevClose: eq.prevClose || 0,
        high: eq.high || 0,
        low: eq.low || 0,
        change: eq.change || 0,
        turnover: eq.turnover || 0,
        volume: eq.volume || 0,
        deals: eq.deals || 0,
        marketCap: eq.marketCap || 0,
        pe: fund.pe,
        eps: fund.eps,
        dividendYield: fund.dividendYield,
        dividendPerShare: fund.dividendPerShare,
        bookValue: fund.bookValue,
        pb: fund.pb,
        sharesOutstanding: fund.sharesOutstanding,
      };
    }),
  };

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Write current prices
  fs.writeFileSync(PRICES_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`[DSE Scraper] Wrote ${PRICES_FILE}`);

  // Append to history
  let history = { entries: [] };
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    } catch {
      history = { entries: [] };
    }
  }

  // One entry per day — replace if same date already exists
  const dayEntry = {
    date: today,
    shares: snapshot.companies
      .filter((c) => c.price > 0)
      .map((c) => ({
        s: c.symbol,
        c: c.price,        // close
        o: c.open,          // open
        h: c.high,          // high
        l: c.low,           // low
        v: c.volume,        // volume
        t: c.turnover,      // turnover
        mc: c.marketCap,    // market cap
      })),
  };

  const existingIdx = history.entries.findIndex((e) => e.date === today);
  if (existingIdx >= 0) {
    history.entries[existingIdx] = dayEntry;
  } else {
    history.entries.push(dayEntry);
  }

  // Keep max 2 years of daily data (~520 trading days)
  if (history.entries.length > 520) {
    history.entries = history.entries.slice(-520);
  }

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
  console.log(`[DSE Scraper] History now has ${history.entries.length} entries`);
  console.log("[DSE Scraper] Done.");
}

main().catch((err) => {
  console.error("[DSE Scraper] Fatal:", err);
  process.exit(1);
});
