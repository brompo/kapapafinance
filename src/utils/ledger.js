import { uid } from '../money.js'
export { uid }
import {
  GROUP_IDS, META_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_ALLOCATION_CATEGORIES,
  CATEGORY_SUBS, DEFAULT_TAB
} from '../constants.js'

export const BOOK_IDS = ['transaction', 'flow', 'kapapa']

export function resolveDefaultTab(vaultData) {
  const settings = vaultData?.settings || {}
  return settings.defaultAppTab || DEFAULT_TAB
}

export function normalizeAccountsWithGroups(inputAccounts, groups) {
  const accounts = Array.isArray(inputAccounts) ? inputAccounts : []
  const groupById = new Map((groups || []).map(g => [g.id, g]))
  const groupByType = new Map((groups || []).map(g => [g.type, g]))
  const fallbackGroup = (groups || [])[0]
  return accounts.map(a => {
    if (a.groupId && groupById.has(a.groupId)) return a
    const typeHint = a.groupType || a.type
    if (typeHint && groupByType.has(typeHint)) {
      const g = groupByType.get(typeHint)
      return { ...a, groupId: g.id, groupType: g.type }
    }
    return fallbackGroup ? { ...a, groupId: fallbackGroup.id, groupType: fallbackGroup.type } : a
  })
}

export function getDefaultGroups() {
  return [
    { id: GROUP_IDS.debit, name: 'Debit', type: 'debit', metaCategory: META_CATEGORIES.WALLET, collapsed: false },
    { id: GROUP_IDS.credit, name: 'Credit', type: 'credit', metaCategory: META_CATEGORIES.OBLIGATIONS, collapsed: false },
    { id: 'group-savings', name: 'Savings', type: 'debit', metaCategory: META_CATEGORIES.SAVINGS, collapsed: false },
    { id: GROUP_IDS.investment, name: 'Invest', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.shares, name: 'Shares', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.realEstate, name: 'Real Estate', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false }
  ]
}

function normalizeGroups(groups) {
  const fallbackGroups = getDefaultGroups()
  return Array.isArray(groups) && groups.length
    ? groups.map(g => {
      const name = g.name || 'Group'
      const normalizedName = name.toLowerCase()
      let id = g.id || uid()
      if (normalizedName === 'debit') id = GROUP_IDS.debit
      else if (normalizedName === 'credit') id = GROUP_IDS.credit
      else if (normalizedName === 'investment' || normalizedName === 'invest') id = GROUP_IDS.investment
      else if (normalizedName === 'shares') id = GROUP_IDS.shares
      else if (normalizedName === 'real estate') id = GROUP_IDS.realEstate

      const type = g.type === 'credit' ? 'credit' : (g.type === 'asset' ? 'asset' : (g.type === 'loan' ? 'loan' : 'debit'))
      let metaCategory = g.metaCategory
      if (metaCategory === 'debt') metaCategory = META_CATEGORIES.OBLIGATIONS // Migration

      if (!metaCategory) {
        if (type === 'credit' || type === 'loan') metaCategory = META_CATEGORIES.OBLIGATIONS
        else if (type === 'asset') metaCategory = META_CATEGORIES.ASSET
        else metaCategory = META_CATEGORIES.WALLET
      }

      return { id, name, type, metaCategory, collapsed: !!g.collapsed }
    })
    : fallbackGroups
}

export const GROWTH_POOL_DEFS = [
  { name: 'Upkeep Buffer', priority: 1 },
  { name: 'Family Projects', priority: 2 },
  { name: 'Investments', priority: 3 }
]

// Growth percent can change month to month without rewriting history: each edit
// appends a `{ month, percent }` entry rather than overwriting a flat value, and
// resolving a given month walks the (ascending) list for the last entry that
// started on or before it. Months before the earliest entry fall back to the
// legacy flat `percent`, so books saved before this feature existed need no
// migration.
export function getGrowthPercentForMonth(meta, monthKey) {
  const history = Array.isArray(meta?.percentHistory) ? meta.percentHistory : []
  let effective = null
  for (const entry of history) {
    if (entry.month <= monthKey) effective = entry.percent
    else break
  }
  if (effective === null) effective = meta?.percent
  return Number(effective || 0)
}

// Upserts (by month) into the percent history. The legacy flat `percent` is
// left untouched — it's the floor value for any month before the earliest
// history entry, so it must never be overwritten by a later edit or it would
// retroactively change months that predate all recorded history.
export function withGrowthPercentForMonth(meta, monthKey, percent) {
  const existing = meta && typeof meta === 'object' ? meta : {}
  const history = (Array.isArray(existing.percentHistory) ? existing.percentHistory : [])
    .filter(entry => entry.month !== monthKey)
  history.push({ month: monthKey, percent })
  history.sort((a, b) => a.month.localeCompare(b.month))
  return { ...existing, percentHistory: history }
}

// Same month-scoped-history approach as growth percent, applied to a Lifestyle
// bucket's Monthly Target: editing one month's target doesn't rewrite earlier
// months, and later months keep inheriting the last-set value until they get
// their own edit.
export function getBudgetForMonth(meta, monthKey) {
  const history = Array.isArray(meta?.budgetHistory) ? meta.budgetHistory : []
  let effective = null
  for (const entry of history) {
    if (entry.month <= monthKey) effective = entry.budget
    else break
  }
  if (effective === null) effective = meta?.budget
  return Number(effective || 0)
}

export function withBudgetForMonth(meta, monthKey, budget) {
  const existing = meta && typeof meta === 'object' ? meta : {}
  const history = (Array.isArray(existing.budgetHistory) ? existing.budgetHistory : [])
    .filter(entry => entry.month !== monthKey)
  history.push({ month: monthKey, budget })
  history.sort((a, b) => a.month.localeCompare(b.month))
  return { ...existing, budgetHistory: history }
}

// The Family Upkeep goal (target % of income) follows the same month-scoped
// history approach as Growth percent above: editing it only changes the goal
// from that month forward, so past months keep showing whatever goal was
// actually in effect then. No goal ever set (or no history entry old enough)
// falls back to 50%, matching the goal's own default.
export function getUpkeepGoalPercentForMonth(goal, monthKey) {
  const history = Array.isArray(goal?.percentHistory) ? goal.percentHistory : []
  let effective = null
  for (const entry of history) {
    if (entry.month <= monthKey) effective = entry.percent
    else break
  }
  if (effective === null) effective = goal?.percent
  return Number(effective ?? 50)
}

export function withUpkeepGoalPercentForMonth(goal, monthKey, percent) {
  const existing = goal && typeof goal === 'object' ? goal : {}
  const history = (Array.isArray(existing.percentHistory) ? existing.percentHistory : [])
    .filter(entry => entry.month !== monthKey)
  history.push({ month: monthKey, percent })
  history.sort((a, b) => a.month.localeCompare(b.month))
  return { ...existing, percentHistory: history }
}

// Growth pools are first-class categories (like Lifestyle/allocation buckets)
// so real transactions can be logged against them via CategoryDetail.
function resolveGrowthCategories(growthCategories, growthMeta) {
  if (Array.isArray(growthCategories)) {
    const meta = growthMeta && typeof growthMeta === 'object' ? { ...growthMeta } : {}
    growthCategories.forEach((name, i) => {
      const existing = meta[name] && typeof meta[name] === 'object' ? meta[name] : {}
      const priority = Number.isFinite(Number(existing.priority)) ? Number(existing.priority) : i + 1
      const percent = Number.isFinite(Number(existing.percent)) ? Number(existing.percent) : 0
      meta[name] = { budget: 0, subs: [], ...existing, priority, percent }
    })
    return { categories: growthCategories, meta }
  }

  const source = GROWTH_POOL_DEFS.map(def => ({ ...def, percent: 0 }))
  const categories = []
  const meta = {}
  source.forEach(p => {
    let name = p.name
    let n = 2
    while (meta[name]) { name = `${p.name} (${n})`; n += 1 }
    categories.push(name)
    meta[name] = { budget: 0, subs: [], priority: p.priority, percent: p.percent }
  })
  return { categories, meta }
}

function resolveAllocationMeta(allocationCategories, allocationMeta) {
  const meta = allocationMeta && typeof allocationMeta === 'object' ? { ...allocationMeta } : {}
  allocationCategories.forEach((name, i) => {
    const existing = meta[name] && typeof meta[name] === 'object' ? meta[name] : {}
    if (!Number.isFinite(Number(existing.priority))) {
      meta[name] = { budget: 0, subs: [], ...existing, priority: i + 1 }
    } else {
      meta[name] = existing
    }
  })
  return meta
}

// A "book" is one of the app's three fixed transaction ledgers — transaction,
// flow, kapapa — sharing one vault. Its identity is its key in the vault
// object, not an id/name/type field like the old multi-ledger model had.
export function createBook({ txns = [], categories, categoryMeta } = {}) {
  const resolvedGrowth = resolveGrowthCategories(categories?.growth, categoryMeta?.growth)

  const resolvedCategories = {
    expense: Array.isArray(categories?.expense) ? categories.expense : [...DEFAULT_EXPENSE_CATEGORIES],
    income: Array.isArray(categories?.income) ? categories.income : [...DEFAULT_INCOME_CATEGORIES],
    allocation: Array.isArray(categories?.allocation) ? categories.allocation : [...DEFAULT_ALLOCATION_CATEGORIES],
    growth: resolvedGrowth.categories
  }

  const resolvedMeta = {
    expense: categoryMeta?.expense && typeof categoryMeta.expense === 'object' ? categoryMeta.expense : Object.fromEntries(Object.entries(CATEGORY_SUBS).map(([k, v]) => [k, { budget: 0, subs: v }])),
    income: categoryMeta?.income && typeof categoryMeta.income === 'object' ? categoryMeta.income : {},
    allocation: resolveAllocationMeta(resolvedCategories.allocation, categoryMeta?.allocation),
    growth: resolvedGrowth.meta
  }

  return {
    txns: Array.isArray(txns) ? txns : [],
    categories: resolvedCategories,
    categoryMeta: resolvedMeta
  }
}

// Fully empty starting point — used for the Kapapa book, which (unlike Flow)
// has no legacy config to inherit.
export function createBlankBook() {
  return {
    txns: [],
    categories: { expense: [], income: [], allocation: [], growth: [] },
    categoryMeta: { expense: {}, income: {}, allocation: {}, growth: {} }
  }
}

export function normalizeBook(data) {
  if (!data || typeof data !== 'object') return createBook()
  return createBook({
    txns: data.txns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })
}

export function isVaultEmpty(v) {
  const books = [v?.transaction, v?.flow, v?.kapapa]
  const noTxns = books.every(b => !b?.txns || b.txns.length === 0)
  return noTxns && (!v?.accounts || v.accounts.length === 0) && (!v?.accountTxns || v.accountTxns.length === 0)
}

function defaultSettings(overrides) {
  return {
    pinLockEnabled: false,
    requireAccountForTxns: false,
    defaultAppTab: 'tx',
    defaultInsightTab: 'cashflow',
    insightTabOrder: ['transactions', 'summary', 'cashflow'],
    appTabOrder: ['insights', 'tx', 'accounts', 'settings'],
    flowEnabled: false,
    kapapaEnabled: false,
    insightsEnabled: true,
    ...overrides
  }
}

function stripLedgerScoping(accounts) {
  return (Array.isArray(accounts) ? accounts : []).map(a => {
    const { ledgerId, ledgerIds, subAccounts, ...rest } = a
    const nextSubAccounts = Array.isArray(subAccounts)
      ? subAccounts.map(s => {
        const { ledgerId: _subLedgerId, ...subRest } = s
        return subRest
      })
      : subAccounts
    return nextSubAccounts !== undefined ? { ...rest, subAccounts: nextSubAccounts } : rest
  })
}

export function normalizeVault(data) {
  if (!data) {
    return {
      transaction: createBook(),
      flow: createBlankBook(),
      kapapa: createBlankBook(),
      groups: getDefaultGroups(),
      accounts: [],
      accountTxns: [],
      settings: defaultSettings(),
      clients: []
    }
  }

  // Legacy: bare array of transactions, no other structure at all.
  if (Array.isArray(data)) {
    return {
      transaction: createBook({ txns: data }),
      flow: createBlankBook(),
      kapapa: createBlankBook(),
      groups: getDefaultGroups(),
      accounts: [],
      accountTxns: [],
      settings: defaultSettings(),
      clients: []
    }
  }

  // Already-migrated shape.
  if (data.transaction || data.flow || data.kapapa) {
    const groups = normalizeGroups(data.groups)
    return {
      transaction: normalizeBook(data.transaction),
      flow: normalizeBook(data.flow),
      kapapa: normalizeBook(data.kapapa),
      groups,
      accounts: normalizeAccountsWithGroups(stripLedgerScoping(data.accounts), groups),
      accountTxns: Array.isArray(data.accountTxns) ? data.accountTxns : [],
      settings: defaultSettings({
        ...(data.settings || {}),
        pinLockEnabled: !!data.settings?.pinLockEnabled,
        requireAccountForTxns: !!data.settings?.requireAccountForTxns,
        flowEnabled: !!data.settings?.flowEnabled,
        kapapaEnabled: !!data.settings?.kapapaEnabled,
        insightsEnabled: data.settings?.insightsEnabled !== false
      }),
      clients: Array.isArray(data.clients) ? data.clients : []
    }
  }

  // Legacy multi-ledger shape (vault.ledgers[] + activeLedgerId). Migrate the
  // active ledger into `transaction` verbatim (minus the unused cos/opps
  // business fields), seed `flow` from its Lifestyle/Growth budget config
  // (copied, not moved — the active ledger's own transactions all stay put
  // in `transaction`), and leave `kapapa` blank.
  if (Array.isArray(data.ledgers)) {
    const ledgers = data.ledgers.filter(Boolean)
    const activeLedger = ledgers.find(l => l.id === data.activeLedgerId) || ledgers[0] || {}

    const transactionBook = createBook({
      txns: activeLedger.txns,
      categories: {
        expense: activeLedger.categories?.expense,
        income: activeLedger.categories?.income,
        allocation: activeLedger.categories?.allocation,
        growth: activeLedger.categories?.growth
      },
      categoryMeta: {
        expense: activeLedger.categoryMeta?.expense,
        income: activeLedger.categoryMeta?.income,
        allocation: activeLedger.categoryMeta?.allocation,
        growth: activeLedger.categoryMeta?.growth
      }
    })

    const flowBook = createBook({
      txns: [],
      categories: {
        allocation: activeLedger.categories?.allocation,
        growth: activeLedger.categories?.growth
      },
      categoryMeta: {
        allocation: activeLedger.categoryMeta?.allocation,
        growth: activeLedger.categoryMeta?.growth
      }
    })

    const groups = normalizeGroups(activeLedger.groups)

    return {
      transaction: transactionBook,
      flow: flowBook,
      kapapa: createBlankBook(),
      groups,
      accounts: normalizeAccountsWithGroups(stripLedgerScoping(data.accounts), groups),
      accountTxns: Array.isArray(data.accountTxns) ? data.accountTxns : [],
      settings: defaultSettings({
        ...(data.settings || {}),
        pinLockEnabled: !!data.settings?.pinLockEnabled,
        requireAccountForTxns: !!data.settings?.requireAccountForTxns,
        flowEnabled: !!data.settings?.moneyPipelineEnabled,
        kapapaEnabled: false,
        insightsEnabled: true
      }),
      clients: Array.isArray(data.clients) ? data.clients : []
    }
  }

  // Legacy flat pre-multi-ledger shape (fields directly on the vault object).
  const transactionBook = createBook({
    txns: data.txns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })
  const groups = normalizeGroups(data.groups)

  return {
    transaction: transactionBook,
    flow: createBlankBook(),
    kapapa: createBlankBook(),
    groups,
    accounts: normalizeAccountsWithGroups(stripLedgerScoping(data.accounts), groups),
    accountTxns: Array.isArray(data.accountTxns) ? data.accountTxns : [],
    settings: defaultSettings({
      ...(data.settings || {}),
      pinLockEnabled: !!data.settings?.pinLockEnabled,
      requireAccountForTxns: !!data.settings?.requireAccountForTxns
    }),
    clients: Array.isArray(data.clients) ? data.clients : []
  }
}
