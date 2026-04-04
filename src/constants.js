export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Personal Care',
  'Personal Comms',
  'Transportation',
  'Apps & Accessories',
  'Family Utilities',
  'Family Expenses',
  'Helping Out',
  'Loans',
  'Charges'
]
export const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Business',
  'Investments',
  'Refunds',
  'Gifts'
]
export const DEFAULT_ALLOCATION_CATEGORIES = [
  'Emergency Fund',
  'Sinking Funds',
  'Investment Pot',
  'Buffer',
  'Debt Paydown'
]
export const DEFAULT_BUSINESS_INCOME_CATEGORIES = [
  'Sales',
  'Services',
  'Investments',
  'Other Income'
]
export const DEFAULT_COS_CATEGORIES = [
  'Direct Labor',
  'Transport & Accommodation',
  'Administration'
]
export const INSIGHT_TAB_LABELS = {
  transactions: 'Records',
  summary: 'Summary',
  cashflow: 'Cashflow',
  analysis: 'Analysis',
  capital: 'Capital'
};

export const APP_TAB_LABELS = {
  insights: 'Insights',
  tx: 'Transactions',
  accounts: 'Accounts',
  settings: 'Settings'
};

export const DEFAULT_OPPS_CATEGORIES = [
  'Rent',
  'Utilities',
  'Payroll',
  'Marketing',
  'Software',
  'Office Supplies',
  'Financing',
  'Taxes & Licenses',
  'Misc'
]
export const CATEGORY_SUBS = {
  Transportation: [
    'Public Trans',
    'Fuel',
    'Maintenance',
    'Road Toll',
    'Parking',
    'Insurance',
    'Battery',
    'Fines'
  ],
  'Helping Out': [
    'Family',
    'Mum',
    'Friends',
    'Wedding',
    'Funerals',
    'Birthday',
    'Neighbour',
    'Charities',
    'OtherGift'
  ]
}
export const SEED_KEY = 'lf_seeded_v1'
export const PIN_FLOW_KEY = 'lf_pinlock_enabled'
export const CLOUD_BACKUP_WARN_DAYS_DEFAULT = 7
export const GOOGLE_CLIENT_ID = '767480942107-j1efssrp3cjvmtlpdue951ogsv3kb52t.apps.googleusercontent.com'
export const GOOGLE_REDIRECT_URI = 'https://brompo.site/kapapafinance/'
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
export const CLOUD_BACKUP_LATEST_NAME = 'kapapa-finance-backup-latest.json'
export const CLOUD_BACKUP_PREFIX = 'kapapa-finance-backup-'

export const GROUP_IDS = {
  debit: 'group-debit',
  credit: 'group-credit',
  investment: 'group-invest',
  shares: 'group-shares',
  realEstate: 'group-real-estate',
  businessCapital: 'group-business-cap',
  businessDebt: 'group-business-debt'
}

export const META_CATEGORIES = {
  WALLET: 'wallet',
  ASSET: 'asset',
  DEBT: 'debt',
  SAVINGS: 'savings'
}
export const DEFAULT_TAB = 'tx' // insights | accounts | tx | settings

export const ALL_LEDGERS_ID = 'all'

export const ALL_LEDGERS_TEMPLATE = {
  id: ALL_LEDGERS_ID,
  name: 'All Ledgers',
  type: 'personal',
  groups: [
    { id: GROUP_IDS.debit, name: 'Debit', type: 'debit', metaCategory: META_CATEGORIES.WALLET, collapsed: false },
    { id: GROUP_IDS.credit, name: 'Credit', type: 'credit', metaCategory: META_CATEGORIES.DEBT, collapsed: false },
    { id: GROUP_IDS.investment, name: 'Investments', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.shares, name: 'Shares', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false },
    { id: GROUP_IDS.realEstate, name: 'Real Estate', type: 'asset', metaCategory: META_CATEGORIES.ASSET, collapsed: false }
  ],
  categories: {
    expense: [...DEFAULT_EXPENSE_CATEGORIES],
    income: [...DEFAULT_INCOME_CATEGORIES],
    cos: [...DEFAULT_COS_CATEGORIES],
    opps: [...DEFAULT_OPPS_CATEGORIES],
    allocation: [...DEFAULT_ALLOCATION_CATEGORIES],
  },
  categoryMeta: {
    expense: {},
    income: {},
    cos: {},
    opps: {},
    allocation: {}
  },
  txns: []
}
