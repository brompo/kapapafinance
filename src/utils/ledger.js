import { todayISO, uid } from '../money.js'
export { uid }
import { 
  GROUP_IDS, META_CATEGORIES, 
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, DEFAULT_ALLOCATION_CATEGORIES,
  DEFAULT_BUSINESS_INCOME_CATEGORIES, DEFAULT_COS_CATEGORIES, DEFAULT_OPPS_CATEGORIES,
  CATEGORY_SUBS, ALL_LEDGERS_ID, ALL_LEDGERS_TEMPLATE
} from '../constants.js'

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

export function createLedger({
  id = uid(),
  name = 'Personal',
  type = 'personal', // 'personal' | 'business'
  txns = [],
  categories,
  categoryMeta,
  groups
} = {}) {
  const fallbackGroups = [
    { id: GROUP_IDS.debit, name: 'Debit', type: 'debit', metaCategory: META_CATEGORIES.WALLET, collapsed: false },
    { id: GROUP_IDS.credit, name: 'Credit', type: 'credit', metaCategory: META_CATEGORIES.DEBT, collapsed: false },
    { id: GROUP_IDS.investment, name: 'Invest', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.shares, name: 'Shares', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.realEstate, name: 'Real Estate', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false }
  ]

  const normalizedGroups = Array.isArray(groups) && groups.length
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
      if (!metaCategory) {
        if (type === 'credit') metaCategory = META_CATEGORIES.DEBT
        else if (type === 'asset' || type === 'loan') metaCategory = META_CATEGORIES.ASSET
        else metaCategory = META_CATEGORIES.WALLET
      }

      return {
        id,
        name,
        type,
        metaCategory,
        collapsed: !!g.collapsed
      }
    })
    : fallbackGroups

  const expenseDefaults = type === 'business' ? [] : [...DEFAULT_EXPENSE_CATEGORIES]
  const incomeDefaults = type === 'business' ? [...DEFAULT_BUSINESS_INCOME_CATEGORIES] : [...DEFAULT_INCOME_CATEGORIES]
  const allocationDefaults = [...DEFAULT_ALLOCATION_CATEGORIES]

  const resolvedCategories = {
    expense: Array.isArray(categories?.expense) ? categories.expense : expenseDefaults,
    income: Array.isArray(categories?.income) ? categories.income : incomeDefaults,
    cos: Array.isArray(categories?.cos) ? categories.cos : (type === 'business' ? [...DEFAULT_COS_CATEGORIES] : []),
    opps: Array.isArray(categories?.opps) ? categories.opps : (type === 'business' ? [...DEFAULT_OPPS_CATEGORIES] : []),
    allocation: Array.isArray(categories?.allocation) ? categories.allocation : allocationDefaults
  }

  const resolvedMeta = {
    expense: categoryMeta?.expense && typeof categoryMeta.expense === 'object' ? categoryMeta.expense : (type === 'business' ? {} : Object.fromEntries(Object.entries(CATEGORY_SUBS).map(([k, v]) => [k, { budget: 0, subs: v }]))),
    income: categoryMeta?.income && typeof categoryMeta.income === 'object' ? categoryMeta.income : {},
    cos: categoryMeta?.cos && typeof categoryMeta.cos === 'object' ? categoryMeta.cos : {},
    opps: categoryMeta?.opps && typeof categoryMeta.opps === 'object' ? categoryMeta.opps : {},
    allocation: categoryMeta?.allocation && typeof categoryMeta.allocation === 'object' ? categoryMeta.allocation : {}
  }

  return {
    id,
    name,
    type,
    txns: Array.isArray(txns) ? txns : [],
    categories: resolvedCategories,
    categoryMeta: resolvedMeta,
    groups: normalizedGroups
  }
}

export function normalizeLedger(data) {
  if (!data || typeof data !== 'object') return createLedger()
  return createLedger({
    id: data.id || uid(),
    name: data.name || 'Personal',
    type: data.type || 'personal',
    txns: data.txns,
    categories: data.categories,
    categoryMeta: data.categoryMeta,
    groups: data.groups
  })
}

export function isVaultEmpty(v) {
  if (Array.isArray(v?.ledgers) && v.ledgers.length > 0) {
    return v.ledgers.every(l =>
      (!l.txns || l.txns.length === 0) &&
      true
    )
  }
  return (
    (!v.txns || v.txns.length === 0) &&
    (!v.accounts || v.accounts.length === 0) &&
    (!v.accountTxns || v.accountTxns.length === 0)
  )
}

export function getSeedVault() {
  const selcomId = uid()
  const absaId = uid()
  const crdbId = uid()
  const airtelId = uid()
  const cashId = uid()
  const realEstateId = uid()
  const stockId = uid()
  const ruthId = uid()
  const lottusId = uid()

  const ledger = createLedger({
    name: 'Personal',
    txns: [],
    categories: {
      expense: [...DEFAULT_EXPENSE_CATEGORIES],
      income: [...DEFAULT_INCOME_CATEGORIES]
    },
    categoryMeta: {
      expense: Object.fromEntries(
        Object.entries(CATEGORY_SUBS).map(([k, v]) => [k, { budget: 0, subs: v }])
      ),
      income: {}
    }
  })

  return {
    ledgers: [ledger],
    activeLedgerId: ledger.id,
    accounts: [
      { id: selcomId, name: 'Selcom Bank', type: 'debit', balance: 150000 },
      { id: absaId, name: 'Absa Account', type: 'debit', balance: 0 },
      { id: crdbId, name: 'CRDB Bank', type: 'debit', balance: 1000000 },
      { id: airtelId, name: 'Airtel Money', type: 'debit', balance: 0 },
      { id: cashId, name: 'Cash', type: 'debit', balance: 0 },
      { id: realEstateId, name: 'Real Estate', type: 'asset', balance: 0 },
      { id: stockId, name: 'CRDB Stock', type: 'asset', balance: 0 },
      { id: ruthId, name: 'Ruth Mnyampi', type: 'credit', balance: 1000000 },
      { id: lottusId, name: 'Lottus', type: 'credit', balance: 100000 },
    ].map(a => {
      let groupId = GROUP_IDS.debit
      if (a.type === 'credit') groupId = GROUP_IDS.credit
      else if (a.type === 'asset') groupId = a.id === realEstateId ? GROUP_IDS.realEstate : GROUP_IDS.shares
      return { ...a, groupType: a.type, groupId, ledgerId: ledger.id }
    }),
    accountTxns: [
      {
        id: uid(),
        accountId: selcomId,
        amount: 50000,
        direction: 'in',
        kind: 'adjust',
        note: 'Balance update',
        date: todayISO()
      },
      {
        id: uid(),
        accountId: selcomId,
        amount: 100000,
        direction: 'in',
        kind: 'transfer',
        relatedAccountId: lottusId,
        note: 'Transfer from Lottus',
        date: todayISO()
      },
      {
        id: uid(),
        accountId: crdbId,
        amount: 1000000,
        direction: 'in',
        kind: 'transfer',
        relatedAccountId: ruthId,
        note: 'Transfer from Ruth Mnyampi',
        date: todayISO()
      },
    ],
    settings: { pinLockEnabled: false }
  }
}

export function normalizeVault(data) {
  if (!data) {
    const ledger = createLedger()
    return {
      ledgers: [ledger],
      activeLedgerId: ledger.id,
      settings: {
        pinLockEnabled: false,
        requireAccountForTxns: false,
        defaultAppTab: 'tx',
        defaultInsightTab: 'cashflow',
        insightTabOrder: ['transactions', 'summary', 'cashflow']
      },
      clients: []
    }
  }

  if (Array.isArray(data)) {
    const ledger = createLedger({ txns: data })
    return {
      ledgers: [ledger],
      activeLedgerId: ledger.id,
      settings: {
        pinLockEnabled: false,
        requireAccountForTxns: false,
        defaultAppTab: 'tx',
        defaultInsightTab: 'cashflow',
        insightTabOrder: ['transactions', 'summary', 'cashflow']
      },
      clients: []
    }
  }

  if (Array.isArray(data.ledgers)) {
    const ledgers = data.ledgers.length ? data.ledgers.map(l => normalizeLedger(l)) : [createLedger()]
    const activeLedgerId = ledgers.find(l => l.id === data.activeLedgerId)?.id || ledgers[0]?.id || ''
    return {
      ledgers,
      activeLedgerId,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      accountTxns: Array.isArray(data.accountTxns) ? data.accountTxns : [],
      settings: {
        ...(data.settings || {}),
        pinLockEnabled: !!data.settings?.pinLockEnabled,
        requireAccountForTxns: !!data.settings?.requireAccountForTxns,
        defaultAppTab: data.settings?.defaultAppTab || 'tx',
        defaultInsightTab: data.settings?.defaultInsightTab || 'summary',
        insightTabOrder: data.settings?.insightTabOrder || ['transactions', 'summary', 'cashflow'],
        appTabOrder: data.settings?.appTabOrder || ['insights', 'tx', 'accounts', 'settings']
      },
      clients: Array.isArray(data.clients) ? data.clients : []
    }
  }

  const legacyLedger = createLedger({
    txns: data.txns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })

  return {
    ledgers: [legacyLedger],
    activeLedgerId: legacyLedger.id,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    accountTxns: Array.isArray(data.accountTxns) ? data.accountTxns : [],
    settings: {
      ...(data.settings || {}),
      pinLockEnabled: !!data.settings?.pinLockEnabled,
      requireAccountForTxns: !!data.settings?.requireAccountForTxns,
      defaultAppTab: data.settings?.defaultAppTab || 'tx',
      defaultInsightTab: data.settings?.defaultInsightTab || 'summary',
      insightTabOrder: data.settings?.insightTabOrder || ['transactions', 'summary', 'cashflow'],
      appTabOrder: data.settings?.appTabOrder || ['insights', 'tx', 'accounts', 'settings']
    },
    clients: Array.isArray(data.clients) ? data.clients : []
  }
}
