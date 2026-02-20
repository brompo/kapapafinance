import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  hasPin,
  setNewPin,
  loadVault,
  saveVault,
  loadVaultPlain,
  saveVaultPlain,
  exportEncryptedBackup,
  importEncryptedBackup,
  resetAll
} from './cryptoVault.js'

import { fmtTZS, fmtCompact, monthKey, todayISO, calculateAssetMetrics } from './money.js'

import AccountsScreen from './screens/Accounts.jsx'
import BottomNav from './components/BottomNav.jsx'

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Personal Care',
  'Personal Comms',
  'Transportation',
  'Family Utilities',
  'Technology Tools',
  'Family Expenses',
  'Helping Out',
  'Loans',
  'Charges'
]
const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Business',
  'Investments',
  'Refunds',
  'Gifts'
]
const CATEGORY_SUBS = {
  Transportation: [
    'Cleaning',
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
const SEED_KEY = 'lf_seeded_v1'
const PIN_FLOW_KEY = 'lf_pinlock_enabled'
const CLOUD_BACKUP_WARN_DAYS_DEFAULT = 7
const GOOGLE_CLIENT_ID = '767480942107-j1efssrp3cjvmtlpdue951ogsv3kb52t.apps.googleusercontent.com'
const GOOGLE_REDIRECT_URI = 'https://brompo.site/kapapafinance/'
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata'
const CLOUD_BACKUP_LATEST_NAME = 'kapapa-finance-backup-latest.json'
const CLOUD_BACKUP_PREFIX = 'kapapa-finance-backup-'

const GROUP_IDS = {
  debit: 'group-debit',
  credit: 'group-credit',
  investment: 'group-invest',
  shares: 'group-shares',
  realEstate: 'group-real-estate'
}

const ALL_LEDGERS_ID = 'all'

const ALL_LEDGERS_TEMPLATE = {
  id: ALL_LEDGERS_ID,
  name: 'All Ledgers',
  groups: [
    { id: GROUP_IDS.debit, name: 'Debit', type: 'debit', collapsed: false },
    { id: GROUP_IDS.credit, name: 'Credit', type: 'credit', collapsed: false },
    { id: GROUP_IDS.investment, name: 'Investments', type: 'asset', collapsed: false },
    { id: GROUP_IDS.shares, name: 'Shares', type: 'asset', collapsed: false },
    { id: GROUP_IDS.realEstate, name: 'Real Estate', type: 'asset', collapsed: false }
  ]
}

function uid() {
  return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16)
}

function base64UrlEncode(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(data) {
  const enc = new TextEncoder()
  return crypto.subtle.digest('SHA-256', enc.encode(data))
}

function randomString(len = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
  const arr = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(arr, x => chars[x % chars.length]).join('')
}



function normalizeAccountsWithGroups(inputAccounts, groups) {
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

function createLedger({
  id = uid(),
  name = 'Personal',
  txns = [],
  categories,
  categoryMeta,
  groups
} = {}) {
  const fallbackGroups = [
    { id: GROUP_IDS.debit, name: 'Debit', type: 'debit', collapsed: false },
    { id: GROUP_IDS.credit, name: 'Credit', type: 'credit', collapsed: false },
    { id: GROUP_IDS.investment, name: 'Invest', type: 'asset', collapsed: false },
    { id: GROUP_IDS.shares, name: 'Shares', type: 'asset', collapsed: false },
    { id: GROUP_IDS.realEstate, name: 'Real Estate', type: 'asset', collapsed: false }
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
      return {
        id,
        name,
        type: g.type === 'credit' ? 'credit' : (g.type === 'asset' ? 'asset' : 'debit'),
        collapsed: !!g.collapsed
      }
    })
    : fallbackGroups

  return {
    id,
    name,
    txns: Array.isArray(txns) ? txns : [],
    categories: {
      expense: Array.isArray(categories?.expense)
        ? categories.expense
        : [...DEFAULT_EXPENSE_CATEGORIES],
      income: Array.isArray(categories?.income)
        ? categories.income
        : [...DEFAULT_INCOME_CATEGORIES]
    },
    categoryMeta: {
      expense: categoryMeta?.expense && typeof categoryMeta.expense === 'object'
        ? categoryMeta.expense
        : {},
      income: categoryMeta?.income && typeof categoryMeta.income === 'object'
        ? categoryMeta.income
        : {}
    },
    groups: normalizedGroups
  }
}

function normalizeLedger(data) {
  if (!data || typeof data !== 'object') return createLedger()
  return createLedger({
    id: data.id || uid(),
    name: data.name || 'Personal',
    txns: data.txns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })
}

function isVaultEmpty(v) {
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

function getSeedVault() {
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

// We now store an object in the encrypted vault (not just an array)
// { ledgers: [{...}], activeLedgerId: '', settings: { pinLockEnabled: false } }
function normalizeVault(data) {
  if (!data) {
    const ledger = createLedger()
    return {
      ledgers: [ledger],
      activeLedgerId: ledger.id,
      settings: { pinLockEnabled: false }
    }
  }

  // Backward compatibility: if old vault is an array, treat it as txns
  if (Array.isArray(data)) {
    const ledger = createLedger({ txns: data })
    return {
      ledgers: [ledger],
      activeLedgerId: ledger.id,
      settings: { pinLockEnabled: false }
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
      settings: { ...(data.settings || {}), pinLockEnabled: !!data.settings?.pinLockEnabled }
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
    settings: { ...(data.settings || {}), pinLockEnabled: !!data.settings?.pinLockEnabled }
  }
}

export default function App() {
  const [stage, setStage] = useState('loading') // loading | setpin | unlock | app
  const [tab, setTab] = useState('accounts') // home | accounts | tx | settings
  const [selectedCategory, setSelectedCategory] = useState(null) // { type, name }

  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [toast, setToast] = useState('')
  const [showLedgerPicker, setShowLedgerPicker] = useState(false)
  const [focusAccountId, setFocusAccountId] = useState(null)
  const [showAccountsHeader, setShowAccountsHeader] = useState(true)
  const [showBudgetSettings, setShowBudgetSettings] = useState(false)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [cloudAccessToken, setCloudAccessToken] = useState('')
  const [cloudAccessExpiry, setCloudAccessExpiry] = useState(0)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [restoreFiles, setRestoreFiles] = useState([])
  const [restorePin, setRestorePin] = useState('')
  const [selectedRestoreId, setSelectedRestoreId] = useState('')

  const [vault, setVaultState] = useState(() => normalizeVault(null))

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    category: 'Food',
    note: '',
    date: todayISO(),
    accountId: ''
  })

  const settings = vault.settings || { pinLockEnabled: false }
  const cloudBackup = settings.cloudBackup || {
    enabled: false,
    provider: 'google',
    warnDays: CLOUD_BACKUP_WARN_DAYS_DEFAULT,
    google: {}
  }
  const cloudGoogle = cloudBackup.google || {}
  const ledgers = vault.ledgers || []
  const activeLedgerId = vault.activeLedgerId || ledgers[0]?.id || ''
  const activeLedger = activeLedgerId === ALL_LEDGERS_ID
    ? ALL_LEDGERS_TEMPLATE
    : (ledgers.find(l => l.id === activeLedgerId) || ledgers[0] || createLedger())
  const rawAccounts = Array.isArray(vault.accounts) ? vault.accounts : []

  // Helper to check if an account or its subaccounts belong to the active ledger
  function isAccountInLedger(account, ledgerId) {
    if (ledgerId === ALL_LEDGERS_ID) return true
    if (account.ledgerId === ledgerId) return true
    if (Array.isArray(account.subAccounts)) {
      return account.subAccounts.some(s => s.ledgerId === ledgerId)
    }
    return false
  }

  const normalizedActiveAccounts = normalizeAccountsWithGroups(
    activeLedgerId === ALL_LEDGERS_ID
      ? rawAccounts
      : rawAccounts.filter(a => isAccountInLedger(a, activeLedger.id)),
    activeLedger.groups
  )
  const normalizedById = useMemo(
    () => new Map(normalizedActiveAccounts.map(a => [a.id, a])),
    [normalizedActiveAccounts]
  )
  const allAccounts = rawAccounts.map(a => normalizedById.get(a.id) || a)
  const allAccountTxns = Array.isArray(vault.accountTxns) ? vault.accountTxns : []
  const ledgerAccountIds = useMemo(
    () => new Set(
      activeLedgerId === ALL_LEDGERS_ID
        ? allAccounts.map(a => a.id)
        : allAccounts.filter(a => a.ledgerId === activeLedger.id).map(a => a.id)
    ),
    [allAccounts, activeLedger.id, activeLedgerId]
  )
  const accounts = normalizedActiveAccounts
  const accountTxns = allAccountTxns.filter(t => ledgerAccountIds.has(t.accountId))

  const didMigrateLedgerIds = useRef(false)
  useEffect(() => {
    if (didMigrateLedgerIds.current) return
    const needs = allAccounts.some(a => !a.ledgerId)
    if (!needs) return
    didMigrateLedgerIds.current = true
    const nextAccounts = allAccounts.map(a => (
      a.ledgerId ? a : {
        ...a,
        ledgerId: activeLedger.id,
        subAccounts: Array.isArray(a.subAccounts)
          ? a.subAccounts.map(s => ({ ...s, ledgerId: activeLedger.id }))
          : a.subAccounts
      }
    ))
    persist({ ...vault, accounts: nextAccounts })
  }, [allAccounts, activeLedger.id, vault])

  const didMigrateGroups = useRef(false)
  useEffect(() => {
    if (didMigrateGroups.current) return
    if (!Array.isArray(ledgers) || !ledgers.length) return
    const needs = ledgers.some(l => !Array.isArray(l.groups) || !l.groups.find(g => g.id === GROUP_IDS.investment))
    if (!needs) return
    didMigrateGroups.current = true
    const nextLedgers = ledgers.map(l => {
      const groups = Array.isArray(l.groups) ? l.groups : []
      if (groups.find(g => g.id === GROUP_IDS.investment)) return l
      const creditIndex = groups.findIndex(g => g.id === GROUP_IDS.credit)
      const insertAt = creditIndex >= 0 ? creditIndex + 1 : groups.length
      const nextGroups = [...groups]
      nextGroups.splice(insertAt, 0, { id: GROUP_IDS.investment, name: 'Invest', type: 'asset', collapsed: false })
      return { ...l, groups: nextGroups }
    })
    persist({ ...vault, ledgers: nextLedgers })
  }, [ledgers, vault])

  useEffect(() => {
    if (localStorage.getItem(PIN_FLOW_KEY) === null) {
      localStorage.setItem(PIN_FLOW_KEY, 'false')
    }
    const pinFlowEnabled = localStorage.getItem(PIN_FLOW_KEY) !== 'false'
    if (!pinFlowEnabled) {
      const plain = loadVaultPlain()
      setVaultState(normalizeVault(plain))
      setStage('app')
      setTab('home')
      return
    }
    setStage(hasPin() ? 'unlock' : 'setpin')
  }, [])

  useEffect(() => {
    async function handleAuthRedirect() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const err = params.get('error')
      if (!code && !err) return
      if (err) {
        show('Google sign-in cancelled.')
        window.history.replaceState({}, '', window.location.origin + '/kapapafinance/')
        return
      }
      if (!code) return
      const storedState = sessionStorage.getItem('gdrive_oauth_state')
      const verifier = sessionStorage.getItem('gdrive_oauth_verifier')
      if (!verifier || !storedState || storedState !== state) {
        show('Google sign-in failed.')
        window.history.replaceState({}, '', window.location.origin + '/kapapafinance/')
        return
      }
      try {
        const token = await exchangeGoogleCode(code, verifier)
        const pending = {
          refreshToken: token.refresh_token || '',
          accessToken: token.access_token || '',
          expiresIn: token.expires_in || 0
        }
        sessionStorage.setItem('gdrive_pending_token', JSON.stringify(pending))
        show('Google Drive connected. Unlock to finish.')
      } catch (e) {
        show('Google sign-in failed.')
      } finally {
        sessionStorage.removeItem('gdrive_oauth_state')
        sessionStorage.removeItem('gdrive_oauth_verifier')
        window.history.replaceState({}, '', window.location.origin + '/kapapafinance/')
      }
    }
    handleAuthRedirect()
  }, [])

  useEffect(() => {
    const pending = sessionStorage.getItem('gdrive_pending_token')
    if (!pending) return
    if (stage !== 'app') return
    try {
      const data = JSON.parse(pending)
      if (data.refreshToken) {
        const next = {
          ...settings,
          cloudBackup: {
            ...(settings.cloudBackup || {}),
            enabled: true,
            provider: 'google',
            warnDays: settings.cloudBackup?.warnDays || CLOUD_BACKUP_WARN_DAYS_DEFAULT,
            google: {
              ...(settings.cloudBackup?.google || {}),
              refreshToken: data.refreshToken,
              lastBackupAt: settings.cloudBackup?.google?.lastBackupAt || null,
              latestFileId: settings.cloudBackup?.google?.latestFileId || null
            }
          }
        }
        persist({ ...vault, settings: next })
        show('Google Drive connected.')
      }
    } catch { }
    sessionStorage.removeItem('gdrive_pending_token')
  }, [stage, settings, vault])

  function show(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3800)
  }

  async function startGoogleAuth() {
    const verifier = randomString(64)
    const challenge = base64UrlEncode(await sha256(verifier))
    const state = randomString(24)
    sessionStorage.setItem('gdrive_oauth_state', state)
    sessionStorage.setItem('gdrive_oauth_verifier', verifier)
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_SCOPES)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    window.location.href = authUrl.toString()
  }

  async function exchangeGoogleCode(code, verifier) {
    const body = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Token exchange failed.')
    return res.json()
  }

  async function refreshGoogleToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Token refresh failed.')
    return res.json()
  }

  async function getGoogleAccessToken() {
    const cloud = settings.cloudBackup || {}
    const refreshToken = cloud.google?.refreshToken
    if (!refreshToken) throw new Error('Not connected to Google Drive.')
    const now = Date.now()
    if (cloudAccessToken && cloudAccessExpiry && now < cloudAccessExpiry - 30000) {
      return cloudAccessToken
    }
    const token = await refreshGoogleToken(refreshToken)
    const expiresAt = Date.now() + (Number(token.expires_in || 0) * 1000)
    setCloudAccessToken(token.access_token || '')
    setCloudAccessExpiry(expiresAt)
    return token.access_token
  }

  async function driveUploadFile({ content, name, fileId }) {
    const accessToken = await getGoogleAccessToken()
    const boundary = '-------kapapa' + Math.random().toString(16).slice(2)
    const metadata = {
      name,
      parents: ['appDataFolder']
    }
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n')
    const endpoint = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
    const res = await fetch(endpoint, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    })
    if (!res.ok) throw new Error('Upload failed.')
    return res.json()
  }

  async function driveListBackups() {
    const accessToken = await getGoogleAccessToken()
    const q = "name contains 'kapapa-finance-backup' and trashed=false"
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('spaces', 'appDataFolder')
    url.searchParams.set('q', q)
    url.searchParams.set('fields', 'files(id,name,modifiedTime)')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('List failed.')
    const data = await res.json()
    return Array.isArray(data.files) ? data.files : []
  }

  async function driveDownloadFile(fileId) {
    const accessToken = await getGoogleAccessToken()
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('Download failed.')
    return res.text()
  }

  async function handlePinToggle(nextEnabled) {
    if (nextEnabled) {
      if (!hasPin()) {
        setStage('setpin')
        show('Set a PIN to enable lock.')
        return
      }
      const entered = pin || prompt('Enter your PIN to enable lock')
      if (!entered) return
      try {
        const data = normalizeVault(loadVaultPlain())
        const nextVault = { ...data, settings: { ...settings, pinLockEnabled: true } }
        setPin(entered)
        setVaultState(nextVault)
        await saveVault(entered, nextVault)
        localStorage.setItem(PIN_FLOW_KEY, 'true')
        show('PIN lock enabled.')
      } catch (e) {
        show('Could not enable PIN lock.')
      }
      return
    }

    const entered = pin || (hasPin() ? prompt('Enter your PIN to disable lock') : '')
    if (hasPin() && !entered) return
    try {
      const data = hasPin() ? normalizeVault(await loadVault(entered)) : normalizeVault(loadVaultPlain())
      const nextVault = { ...data, settings: { ...settings, pinLockEnabled: false } }
      saveVaultPlain(nextVault)
      setVaultState(nextVault)
      localStorage.setItem(PIN_FLOW_KEY, 'false')
      setStage('app')
      setTab('home')
      show('PIN lock disabled.')
    } catch (e) {
      show('Could not disable PIN lock.')
    }
  }

  async function handleSetPin() {
    try {
      if (!pin || pin.length < 4) return show('PIN must be at least 4 digits/characters.')
      if (pin !== pin2) return show('PINs do not match.')
      await setNewPin(pin)

      let data = normalizeVault(await loadVault(pin))
      if (!localStorage.getItem(SEED_KEY) && isVaultEmpty(data)) {
        localStorage.setItem(SEED_KEY, '0')
      }
      data = { ...data, settings: { ...data.settings, pinLockEnabled: true } }
      await saveVault(pin, data)
      localStorage.setItem(PIN_FLOW_KEY, 'true')
      setVaultState(data)

      setStage('app')
      setTab('accounts')
      show('PIN set. Vault created.')
    } catch (e) {
      show(e.message || 'Failed to set PIN.')
    }
  }

  async function handleUnlock() {
    try {
      let data = normalizeVault(await loadVault(pin))
      if (!localStorage.getItem(SEED_KEY) && isVaultEmpty(data)) {
        localStorage.setItem(SEED_KEY, '0')
      }
      data = { ...data, settings: { ...data.settings, pinLockEnabled: true } }
      await saveVault(pin, data)
      localStorage.setItem(PIN_FLOW_KEY, 'true')
      setVaultState(data)

      setStage('app')
      setTab('accounts')
      show('Unlocked.')
    } catch (e) {
      show('Wrong PIN or vault corrupted.')
    }
  }

  async function persist(nextVault) {
    setVaultState(nextVault)
    try {
      const pinFlowEnabled = localStorage.getItem(PIN_FLOW_KEY) !== 'false'
      if (pinFlowEnabled) await saveVault(pin, nextVault)
      else saveVaultPlain(nextVault)
    } catch (e) {
      show('Could not save (are you locked?)')
    }
  }

  function updateSettings(next) {
    persist({ ...vault, settings: next })
  }

  // ---------- Transactions ----------
  const txns = activeLedger.txns || []
  const categories = activeLedger.categories || {
    expense: [...DEFAULT_EXPENSE_CATEGORIES],
    income: [...DEFAULT_INCOME_CATEGORIES]
  }
  const categoryMeta = activeLedger.categoryMeta || { expense: {}, income: {} }

  const expenseCats = categories.expense || [...DEFAULT_EXPENSE_CATEGORIES]
  const incomeCats = categories.income || [...DEFAULT_INCOME_CATEGORIES]

  function persistActiveLedger(nextLedger) {
    const hasActive = ledgers.some(l => l.id === activeLedger.id)
    const nextLedgers = hasActive
      ? ledgers.map(l => (l.id === activeLedger.id ? nextLedger : l))
      : [...ledgers, nextLedger]
    const nextActiveId = hasActive ? activeLedger.id : nextLedger.id
    persist({ ...vault, ledgers: nextLedgers, activeLedgerId: nextActiveId })
  }

  function persistLedgerAndAccounts({ nextLedger, nextAccounts, nextAccountTxns }) {
    const hasActive = ledgers.some(l => l.id === activeLedger.id)
    const nextLedgers = hasActive
      ? ledgers.map(l => (l.id === activeLedger.id ? nextLedger : l))
      : [...ledgers, nextLedger]
    const nextActiveId = hasActive ? activeLedger.id : nextLedger.id
    persist({
      ...vault,
      ledgers: nextLedgers,
      activeLedgerId: nextActiveId,
      accounts: nextAccounts ?? allAccounts,
      accountTxns: nextAccountTxns ?? allAccountTxns
    })
  }

  function handleAddLedger() {
    const name = prompt('Ledger name?')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    const nextLedger = createLedger({ name: trimmed })
    persist({
      ...vault,
      ledgers: [...ledgers, nextLedger],
      activeLedgerId: nextLedger.id
    })
    setShowLedgerPicker(false)
  }

  function handleSelectLedger(id) {
    if (!id || id === activeLedgerId) {
      setShowLedgerPicker(false)
      return
    }
    persist({ ...vault, activeLedgerId: id })
    setSelectedCategory(null)
    setShowLedgerPicker(false)
  }

  async function handleSwitchLedgerToAccounts(id, accountId) {
    if (!id || id === activeLedger.id) return
    await persist({ ...vault, activeLedgerId: id })
    setTab('accounts')
    setFocusAccountId(accountId || null)
  }

  function formatMonthLabel(value) {
    const d = new Date(`${value}-01`)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  function shiftMonth(delta) {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return
    const next = new Date(y, m - 1 + delta, 1)
    const ny = next.getFullYear()
    const nm = String(next.getMonth() + 1).padStart(2, '0')
    setMonth(`${ny}-${nm}`)
  }

  const filteredTxns = useMemo(() => {
    return txns
      .filter(t => monthKey(t.date) === month)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [txns, month])

  const filteredAccountTxns = useMemo(() => {
    return accountTxns
      .filter(t => monthKey(t.date) === month)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [accountTxns, month])

  const kpis = useMemo(() => {
    let inc = 0, exp = 0
    for (const t of filteredTxns) {
      const amt = Number(t.amount || 0)
      if (t.type === 'income') {
        if (!t.reimbursementOf) inc += amt
      } else {
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        exp += amt - reimbursed
      }
    }

    // Add Realized Gains from Asset Sales
    const assets = accounts.filter(a => {
      const g = activeLedger.groups.find(g => g.id === a.groupId);
      return g && g.type === 'asset';
    });

    let totalGains = 0;
    for (const acc of assets) {
      // We need all txns for this account to calculate WAC
      // But we only sum gains that happened in *this month*
      const info = calculateAssetMetrics(acc, accountTxns, 'asset');
      const monthsGains = info.realizedGains.filter(g => monthKey(g.date) === month);
      for (const g of monthsGains) {
        totalGains += g.amount;
      }
    }
    inc += totalGains;

    return { inc, exp, bal: inc - exp }
  }, [filteredTxns, accounts, activeLedger.groups, accountTxns, month])

  const cloudLastBackup = cloudGoogle.lastBackupAt ? new Date(cloudGoogle.lastBackupAt) : null
  const cloudWarnDays = cloudBackup.warnDays || CLOUD_BACKUP_WARN_DAYS_DEFAULT
  const cloudStale = cloudLastBackup
    ? (Date.now() - cloudLastBackup.getTime()) > cloudWarnDays * 86400000
    : cloudBackup.enabled

  async function backupNow({ silent = false } = {}) {
    if (!cloudBackup.enabled) {
      if (!silent) show('Cloud backup is disabled.')
      return
    }
    if (!cloudGoogle.refreshToken) {
      if (!silent) show('Connect Google Drive first.')
      return
    }
    if (cloudBusy) return
    setCloudBusy(true)
    setCloudError('')
    try {
      const content = exportEncryptedBackup()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const versionedName = `${CLOUD_BACKUP_PREFIX}${stamp}.json`
      await driveUploadFile({ content, name: versionedName })

      let latestId = cloudGoogle.latestFileId
      if (!latestId) {
        const files = await driveListBackups()
        const found = files.find(f => f.name === CLOUD_BACKUP_LATEST_NAME)
        latestId = found?.id || null
      }
      const latestRes = await driveUploadFile({
        content,
        name: CLOUD_BACKUP_LATEST_NAME,
        fileId: latestId || undefined
      })
      const next = {
        ...settings,
        cloudBackup: {
          ...cloudBackup,
          enabled: true,
          provider: 'google',
          warnDays: cloudWarnDays,
          google: {
            ...cloudGoogle,
            latestFileId: latestRes?.id || latestId || null,
            lastBackupAt: new Date().toISOString(),
            lastBackupError: ''
          }
        }
      }
      updateSettings(next)
      if (!silent) show('Backup complete.')
    } catch (e) {
      setCloudError('Backup failed.')
      const next = {
        ...settings,
        cloudBackup: {
          ...cloudBackup,
          google: {
            ...cloudGoogle,
            lastBackupError: 'Backup failed.'
          }
        }
      }
      updateSettings(next)
      if (!silent) show('Backup failed.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function openRestorePicker() {
    if (!cloudGoogle.refreshToken) {
      show('Connect Google Drive first.')
      return
    }
    setCloudBusy(true)
    setCloudError('')
    try {
      const files = await driveListBackups()
      const sorted = files.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1))
      setRestoreFiles(sorted)
      setSelectedRestoreId(sorted[0]?.id || '')
      setRestorePin('')
      setShowRestoreModal(true)
    } catch (e) {
      setCloudError('Could not load backups.')
      show('Could not load backups.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function restoreFromCloud() {
    if (!selectedRestoreId) return
    if (!restorePin) {
      show('Enter your PIN to restore.')
      return
    }
    setCloudBusy(true)
    setCloudError('')
    try {
      const prevMeta = localStorage.getItem('lf_meta_v1')
      const prevVault = localStorage.getItem('lf_vault_v1')
      const text = await driveDownloadFile(selectedRestoreId)
      importEncryptedBackup(text)
      const data = normalizeVault(await loadVault(restorePin))
      setPin(restorePin)
      setVaultState(data)
      setStage('app')
      setShowRestoreModal(false)
      setRestorePin('')
      show('Restore complete.')
    } catch (e) {
      if (typeof prevMeta === 'string') localStorage.setItem('lf_meta_v1', prevMeta)
      if (typeof prevVault === 'string') localStorage.setItem('lf_vault_v1', prevVault)
      show('Restore failed. Check your PIN.')
    } finally {
      setCloudBusy(false)
    }
  }

  useEffect(() => {
    if (stage !== 'app') return
    if (!cloudBackup.enabled || !cloudGoogle.refreshToken) return
    let lastAuto = 0
    const minInterval = 5 * 60 * 1000
    const handler = () => {
      const now = Date.now()
      if (now - lastAuto < minInterval) return
      lastAuto = now
      backupNow({ silent: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler()
    }
    window.addEventListener('beforeunload', handler)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', handler)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [stage, cloudBackup.enabled, cloudGoogle.refreshToken, cloudGoogle.lastBackupAt])

  async function addTxn(e) {
    e.preventDefault()
    const amt = Number(form.amount)
    if (!amt || amt <= 0) return show('Enter a valid amount.')

    const t = {
      id: uid(),
      type: form.type,
      amount: amt,
      category: form.category,
      note: form.note.trim(),
      date: form.date || todayISO(),
      accountId: form.accountId || ''
    }

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns
    if (t.accountId) {
      const acct = allAccounts.find(a => a.id === t.accountId || a.name === t.accountId)
      if (acct) {
        const targetId = acct.id
        const delta = t.type === 'income' ? amt : -amt
        const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
        const targetSubId = subs.length ? subs[0]?.id : null
        nextAccounts = allAccounts.map(a => {
          if (a.id !== targetId) return a
          if (!subs.length) return { ...a, balance: Number(a.balance || 0) + delta }
          const nextSubs = subs.map(s => (
            s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) + delta } : s
          ))
          return { ...a, subAccounts: nextSubs }
        })
        const entry = {
          id: uid(),
          accountId: targetId,
          subAccountId: targetSubId,
          amount: amt,
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date
        }
        nextAccountTxns = [entry, ...allAccountTxns]
      } else {
        show('Account not found for this transaction.')
      }
    }

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: [t, ...txns] },
      nextAccounts,
      nextAccountTxns
    })
    setForm(f => ({ ...f, amount: '', note: '', date: todayISO() }))
    show('Saved.')
  }

  async function addQuickTxn({ type, amount, category, note, accountId, date, subAccountId }) {
    const amt = Number(amount || 0)
    if (!amt || amt <= 0) return show('Enter a valid amount.')

    const t = {
      id: uid(),
      type,
      amount: amt,
      category,
      note: note ? note.trim() : '',
      date: date || todayISO(),
      accountId: accountId || '',
      subAccountId: subAccountId || ''
    }

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns
    if (t.accountId) {
      const acct = allAccounts.find(a => a.id === t.accountId || a.name === t.accountId)
      if (acct) {
        const targetId = acct.id
        const delta = t.type === 'income' ? amt : -amt
        const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
        // Use provided subAccountId if valid, else default to first sub if subs exist
        const targetSubId = subs.length
          ? (subAccountId && subs.find(s => s.id === subAccountId) ? subAccountId : subs[0]?.id)
          : null

        nextAccounts = allAccounts.map(a => {
          if (a.id !== targetId) return a
          if (!subs.length) return { ...a, balance: Number(a.balance || 0) + delta }
          const nextSubs = subs.map(s => (
            s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) + delta } : s
          ))
          return { ...a, subAccounts: nextSubs }
        })
        const entry = {
          id: `txn-${t.id}`,
          accountId: targetId,
          subAccountId: targetSubId,
          amount: amt,
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date
        }
        nextAccountTxns = [entry, ...allAccountTxns]
      } else {
        show('Account not found for this transaction.')
      }
    }

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: [t, ...txns] },
      nextAccounts,
      nextAccountTxns
    })
    show('Saved.')
  }

  async function addReimbursement({ originalTxnId, amount, accountId, subAccountId, date }) {
    const amt = Number(amount || 0)
    if (!amt || amt <= 0) return show('Enter a valid amount.')
    if (!accountId) return show('Select an account to receive the reimbursement.')

    const originalTxn = txns.find(t => t.id === originalTxnId)
    if (!originalTxn) return show('Original transaction not found.')

    const alreadyReimbursed = (originalTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const remaining = Number(originalTxn.amount || 0) - alreadyReimbursed
    if (amt > remaining) return show(`Cannot reimburse more than the remaining ${fmtTZS(remaining)}.`)

    const reimbTxn = {
      id: uid(),
      type: 'income',
      amount: amt,
      category: 'Reimbursement',
      note: `Reimbursement for: ${originalTxn.note || originalTxn.category || 'Expense'}`,
      date: date || todayISO(),
      accountId: accountId || '',
      subAccountId: subAccountId || '',
      reimbursementOf: originalTxnId
    }

    const updatedOriginal = {
      ...originalTxn,
      reimbursedBy: [...(originalTxn.reimbursedBy || []), { txnId: reimbTxn.id, amount: amt }]
    }

    const nextTxns = txns.map(t => t.id === originalTxnId ? updatedOriginal : t)
    nextTxns.unshift(reimbTxn)

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns
    if (accountId) {
      const acct = allAccounts.find(a => a.id === accountId)
      if (acct) {
        const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
        const targetSubId = subs.length
          ? (subAccountId && subs.find(s => s.id === subAccountId) ? subAccountId : subs[0]?.id)
          : null
        nextAccounts = applyAccountDelta(nextAccounts, accountId, targetSubId, amt)
        const entry = {
          id: `txn-${reimbTxn.id}`,
          accountId,
          subAccountId: targetSubId,
          amount: amt,
          direction: 'in',
          kind: 'txn',
          relatedAccountId: null,
          note: reimbTxn.note,
          date: reimbTxn.date
        }
        nextAccountTxns = [entry, ...allAccountTxns]
      }
    }

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: nextTxns },
      nextAccounts,
      nextAccountTxns
    })
    show('Reimbursement saved.')
  }

  function findAccountByIdOrName(idOrName) {
    if (!idOrName) return null
    return allAccounts.find(a => a.id === idOrName || a.name === idOrName) || null
  }

  async function updateTxn(original, next) {
    const nextTxns = txns.map(t => (t.id === original.id ? next : t))

    let nextAccounts = allAccounts
    const oldAccount = findAccountByIdOrName(original.accountId)
    const newAccount = findAccountByIdOrName(next.accountId)

    const oldDelta = original.type === 'income' ? Number(original.amount || 0) : -Number(original.amount || 0)
    const newDelta = next.type === 'income' ? Number(next.amount || 0) : -Number(next.amount || 0)

    if (oldAccount) {
      nextAccounts = nextAccounts.map(a => {
        if (a.id !== oldAccount.id) return a
        const subs = Array.isArray(a.subAccounts) ? a.subAccounts : []
        if (!subs.length) return { ...a, balance: Number(a.balance || 0) - oldDelta }
        const targetSubId = subs[0]?.id
        const nextSubs = subs.map(s => (
          s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) - oldDelta } : s
        ))
        return { ...a, subAccounts: nextSubs }
      })
    }
    if (newAccount) {
      nextAccounts = nextAccounts.map(a => {
        if (a.id !== newAccount.id) return a
        const subs = Array.isArray(a.subAccounts) ? a.subAccounts : []
        if (!subs.length) return { ...a, balance: Number(a.balance || 0) + newDelta }
        const targetSubId = subs[0]?.id
        const nextSubs = subs.map(s => (
          s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) + newDelta } : s
        ))
        return { ...a, subAccounts: nextSubs }
      })
    }

    const nonTxnEntries = allAccountTxns.filter(t => t.kind !== 'txn')
    const otherTxnEntries = allAccountTxns.filter(
      t => t.kind === 'txn' && !ledgerAccountIds.has(t.accountId)
    )
    const txnEntries = nextTxns
      .filter(t => t.accountId)
      .map(t => {
        const acct = findAccountByIdOrName(t.accountId)
        if (!acct) return null
        const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
        const targetSubId = subs.length ? subs[0]?.id : null
        return {
          id: `txn-${t.id}`,
          accountId: acct.id,
          subAccountId: targetSubId,
          amount: Number(t.amount || 0),
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date || todayISO()
        }
      })
      .filter(Boolean)

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: nextTxns },
      nextAccounts,
      nextAccountTxns: [...txnEntries, ...otherTxnEntries, ...nonTxnEntries]
    })
    show('Updated.')
  }

  async function delTxn(id) {
    const t = txns.find(x => x.id === id)
    if (!t) return

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns

    if (t.accountId) {
      const acct = findAccountByIdOrName(t.accountId)
      if (acct) {
        const entryId = `txn-${t.id}`
        const entry = allAccountTxns.find(at => at.id === entryId)

        const delta = t.type === 'income' ? -Number(t.amount || 0) : Number(t.amount || 0)
        const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
        const subId = (entry && entry.subAccountId) || t.subAccountId || (subs.length ? subs[0].id : null)
        nextAccounts = applyAccountDelta(nextAccounts, acct.id, subId, delta)

        nextAccountTxns = nextAccountTxns.filter(at => at.id !== entryId)
      }
    }

    const nextTxns = txns.filter(x => x.id !== id)

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: nextTxns },
      nextAccounts,
      nextAccountTxns
    })
    show('Deleted.')
  }

  // ---------- Accounts ----------

  async function upsertAccount(acc) {
    const normalized = acc.ledgerId ? acc : { ...acc, ledgerId: activeLedger.id }
    const next = [...allAccounts]
    const idx = next.findIndex(a => a.id === normalized.id)
    if (idx >= 0) next[idx] = { ...next[idx], ...normalized }
    else next.unshift(normalized)
    await persist({ ...vault, accounts: next })
    show('Account saved.')
  }

  async function deleteAccount(id) {
    const next = allAccounts.filter(a => a.id !== id)
    const nextAccountTxns = allAccountTxns.filter(t => t.accountId !== id)
    await persist({ ...vault, accounts: next, accountTxns: nextAccountTxns })
    show('Account deleted.')
  }

  async function addAccountTxn(txnOrList) {
    const txns = Array.isArray(txnOrList) ? txnOrList : [txnOrList]
    if (!txns.length) return

    let nextAccounts = allAccounts
    const newEntries = []

    for (const txnData of txns) {
      const {
        accountId,
        amount,
        direction,
        note,
        kind = 'adjust',
        relatedAccountId = null,
        subAccountId = null,
        creditRate = null,
        creditType = null,
        receiveDate = null,
        interestStartDate = null,
        creditToAccountId = null,
        creditToSubAccountId = null,
        unit = null,
        quantity = null,
        unitPrice = null,
        fee = null,
        category = null,
        linkId = null
      } = txnData

      const acct = nextAccounts.find(a => a.id === accountId)
      if (!acct) continue

      const delta = direction === 'in' ? amount : -amount
      const subAccounts = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
      const targetSubId = subAccounts.length ? (subAccountId || subAccounts[0]?.id) : null

      nextAccounts = nextAccounts.map(a => {
        if (a.id !== accountId) return a
        if (kind === 'valuation') return a
        if (!subAccounts.length) return { ...a, balance: Number(a.balance || 0) + delta }
        const nextSubs = subAccounts.map(s => (
          s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) + delta } : s
        ))
        return { ...a, subAccounts: nextSubs }
      })

      const entry = {
        id: uid(),
        accountId,
        subAccountId: targetSubId,
        amount,
        direction,
        kind,
        relatedAccountId: relatedAccountId || creditToAccountId || null,
        note: note || '',
        date: receiveDate || todayISO(),
        creditRate,
        creditType,
        receiveDate,
        interestStartDate,
        unit,
        quantity,
        unitPrice,
        fee,
        category,
        linkId
      }
      newEntries.push(entry)

      if (kind === 'credit' && creditToAccountId && creditToAccountId !== accountId) {
        const toAcct = nextAccounts.find(a => a.id === creditToAccountId)
        if (toAcct) {
          const toSubs = Array.isArray(toAcct.subAccounts) ? toAcct.subAccounts : []
          const resolvedToSub = toSubs.length ? (creditToSubAccountId || toSubs[0]?.id) : null
          nextAccounts = applyAccountDelta(nextAccounts, creditToAccountId, resolvedToSub, Number(amount || 0))
          const extraEntry = {
            id: uid(),
            accountId: creditToAccountId,
            subAccountId: resolvedToSub,
            amount,
            direction: 'in',
            kind: 'credit',
            relatedAccountId: accountId,
            note: note || `Credit received from ${acct.name}`,
            date: receiveDate || todayISO()
          }
          newEntries.push(extraEntry)
        }
      }
    }

    if (!newEntries.length) return

    const nextEntries = [...newEntries, ...allAccountTxns]
    await persist({ ...vault, accounts: nextAccounts, accountTxns: nextEntries })
    show('Saved.')
  }

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

  async function deleteAccountTxn(entryId) {
    const entry = allAccountTxns.find(t => t.id === entryId)
    if (!entry) return
    let targets = [entry]

    // Cascade delete linked transactions (e.g. Asset Sale + Deposit)
    if (entry.linkId) {
      targets = allAccountTxns.filter(t => t.linkId === entry.linkId)
    }
    // Legacy transfer handling (kept for backward compatibility if needed, though linkId is better)
    else if (entry.kind === 'transfer') {
      const baseId = entry.id.replace(/-(in|out)$/, '')
      targets = allAccountTxns.filter(t => t.kind === 'transfer' && t.id.startsWith(baseId))
    }
    let nextAccounts = allAccounts
    for (const t of targets) {
      const delta = t.direction === 'in' ? -Number(t.amount || 0) : Number(t.amount || 0)
      nextAccounts = applyAccountDelta(nextAccounts, t.accountId, t.subAccountId, delta)
    }
    const idsToRemove = new Set(targets.map(t => t.id))
    const nextAccountTxns = allAccountTxns.filter(t => !idsToRemove.has(t.id))

    // Reverse Sync: If this was a ledger transaction, remove it from the ledger too
    let nextLedgers = vault.ledgers
    let nextActiveLedgerId = activeLedgerId

    // Only attempt to remove from ledger if it looks like a linked transaction (starts with txn-)
    // and we are deleting the main entry (not a transfer pair, though logic covers filtered targets)
    if (entryId.startsWith('txn-')) {
      const ledgerTxnId = entryId.replace('txn-', '')
      // We need to find which ledger it belongs to. 
      // Current architecture assumes mostly active ledger, but let's search.
      nextLedgers = nextLedgers.map(l => {
        if (l.txns.some(t => t.id === ledgerTxnId)) {
          return { ...l, txns: l.txns.filter(t => t.id !== ledgerTxnId) }
        }
        return l
      })
    }

    await persist({
      ...vault,
      ledgers: nextLedgers,
      accounts: nextAccounts,
      accountTxns: nextAccountTxns
    })
    show('Deleted.')
  }

  async function updateAccountTxn(entryId, next) {
    const entry = allAccountTxns.find(t => t.id === entryId)
    if (!entry) return
    const oldAmt = Number(entry.amount || 0)
    const newAmt = Number(next.amount || 0)
    if (!newAmt || newAmt <= 0) return

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns

    if (entry.kind === 'transfer') {
      // Handle transfer update: find the pair and update both
      const baseId = entry.id.replace(/-(in|out)$/, '')
      const pair = allAccountTxns.find(t => t.id !== entry.id && t.id.startsWith(baseId))

      // 1. Revert old amounts
      const deltaRevertEntry = entry.direction === 'in' ? -oldAmt : oldAmt
      nextAccounts = applyAccountDelta(nextAccounts, entry.accountId, entry.subAccountId, deltaRevertEntry)

      if (pair) {
        const deltaRevertPair = pair.direction === 'in' ? -oldAmt : oldAmt
        nextAccounts = applyAccountDelta(nextAccounts, pair.accountId, pair.subAccountId, deltaRevertPair)
      }

      // 2. Apply new amounts
      const deltaApplyEntry = entry.direction === 'in' ? newAmt : -newAmt
      nextAccounts = applyAccountDelta(nextAccounts, entry.accountId, entry.subAccountId, deltaApplyEntry)

      if (pair) {
        const deltaApplyPair = pair.direction === 'in' ? newAmt : -newAmt
        nextAccounts = applyAccountDelta(nextAccounts, pair.accountId, pair.subAccountId, deltaApplyPair)
      }

      // 3. Update transaction entries
      // Update entry
      const updatedEntry = { ...entry, ...next }
      // Update pair with same amount/date/note details
      const updatedPair = pair ? {
        ...pair,
        amount: newAmt,
        date: next.date || pair.date,
        note: next.note || pair.note
      } : null

      nextAccountTxns = nextAccountTxns.map(t => {
        if (t.id === entry.id) return updatedEntry
        if (pair && t.id === pair.id) return updatedPair
        return t
      })

    } else {
      // Normal transaction update
      const delta = entry.direction === 'in' ? (newAmt - oldAmt) : -(newAmt - oldAmt)
      nextAccounts = applyAccountDelta(allAccounts, entry.accountId, entry.subAccountId, delta)
      nextAccountTxns = allAccountTxns.map(t => (
        t.id === entryId ? { ...t, ...next } : t
      ))
    }

    await persist({ ...vault, accounts: nextAccounts, accountTxns: nextAccountTxns })
    show('Updated.')
  }

  async function transferAccount({ fromId, toId, amount, note, fromSubAccountId, toSubAccountId, date }) {
    const from = allAccounts.find(a => a.id === fromId)
    const to = allAccounts.find(a => a.id === toId)
    if (!from || !to) return
    if (fromId === toId && fromSubAccountId === toSubAccountId) return

    const fromSubs = Array.isArray(from.subAccounts) ? from.subAccounts : []
    const toSubs = Array.isArray(to.subAccounts) ? to.subAccounts : []
    const resolvedFromSub = fromSubs.length ? (fromSubAccountId || fromSubs[0]?.id) : null
    const resolvedToSub = toSubs.length ? (toSubAccountId || toSubs[0]?.id) : null

    const nextAccounts = allAccounts.map(a => {
      if (a.id === fromId && a.id === toId) {
        // Intra-account transfer (between sub-accounts)
        const currentSubs = Array.isArray(a.subAccounts) ? a.subAccounts : []
        const nextSubs = currentSubs.map(s => {
          let bal = Number(s.balance || 0)
          if (s.id === resolvedFromSub) bal -= amount
          if (s.id === resolvedToSub) bal += amount
          return { ...s, balance: bal }
        })
        return { ...a, subAccounts: nextSubs }
      }
      if (a.id === fromId) {
        if (!fromSubs.length) return { ...a, balance: Number(a.balance || 0) - amount }
        const nextSubs = fromSubs.map(s => (
          s.id === resolvedFromSub ? { ...s, balance: Number(s.balance || 0) - amount } : s
        ))
        return { ...a, subAccounts: nextSubs }
      }
      if (a.id === toId) {
        if (!toSubs.length) return { ...a, balance: Number(a.balance || 0) + amount }
        const nextSubs = toSubs.map(s => (
          s.id === resolvedToSub ? { ...s, balance: Number(s.balance || 0) + amount } : s
        ))
        return { ...a, subAccounts: nextSubs }
      }
      return a
    })

    const transferId = uid()
    const base = { kind: 'transfer', note: note || '', date: date || todayISO() }
    const outEntry = {
      id: transferId + '-out',
      accountId: fromId,
      subAccountId: resolvedFromSub,
      amount,
      direction: 'out',
      relatedAccountId: toId,
      ...base
    }
    const inEntry = {
      id: transferId + '-in',
      accountId: toId,
      subAccountId: resolvedToSub,
      amount,
      direction: 'in',
      relatedAccountId: fromId,
      ...base
    }

    await persist({ ...vault, accounts: nextAccounts, accountTxns: [inEntry, outEntry, ...allAccountTxns] })
    show('Transfer saved.')
  }

  async function updateAccountGroups(nextGroups) {
    await persistActiveLedger({ ...activeLedger, groups: nextGroups })
  }

  async function updateAccounts(nextAccounts) {
    const activeIds = new Set(accounts.map(a => a.id))
    const otherAccounts = allAccounts.filter(a => !activeIds.has(a.id))
    await persist({ ...vault, accounts: [...nextAccounts, ...otherAccounts] })
  }

  async function handleUpdateLedger(ledgerId, updates) {
    const nextLedgers = vault.ledgers.map(l =>
      l.id === ledgerId ? { ...l, ...updates } : l
    )
    await persist({ ...vault, ledgers: nextLedgers })
  }

  // ---------- Export/Import/Reset ----------
  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1200)
  }

  async function handleExport() {
    const enc = exportEncryptedBackup()
    download(`local-finance-backup-encrypted-${new Date().toISOString().slice(0, 10)}.json`, enc)
    show('Exported encrypted backup.')
  }

  async function handleImport(file) {
    try {
      const text = await file.text()
      importEncryptedBackup(text)
      show('Imported. Unlock with your PIN.')
      setStage('unlock')
      const fresh = normalizeVault(null)
      setVaultState({
        ...fresh,
        settings: { ...fresh.settings, pinLockEnabled: settings.pinLockEnabled }
      })
    } catch (e) {
      show(e.message || 'Import failed.')
    }
  }

  async function handleReset() {
    if (!confirm('This will delete everything on this device. Continue?')) return
    await resetAll()
    localStorage.removeItem(SEED_KEY)
    localStorage.setItem(PIN_FLOW_KEY, 'false')
    setPin(''); setPin2('')
    setVaultState(normalizeVault(null))
    setStage('setpin')
    show('Reset complete.')
  }

  async function handleWipeAll() {
    if (!confirm('This will remove all user and demo data and reset the app. Continue?')) return
    await resetAll()
    localStorage.removeItem(SEED_KEY)
    localStorage.setItem(PIN_FLOW_KEY, 'false')
    setPin(''); setPin2('')
    setVaultState(normalizeVault(null))
    setStage('setpin')
    show('All data cleared.')
  }

  async function handleLoadDemo() {
    if (!confirm('Load demo data? This will replace your current data.')) return
    const data = getSeedVault()
    localStorage.setItem(SEED_KEY, '1')
    await persist(data)
    show('Demo data loaded.')
  }

  // ---------- Screens ----------
  function HomeScreen() {
    const monthLabel = useMemo(() => formatMonthLabel(month), [month])
    const [collapseExpense, setCollapseExpense] = useState(() => {
      try { return localStorage.getItem('collapse_expense') === 'true' } catch { return false }
    })
    const [collapseIncome, setCollapseIncome] = useState(() => {
      try { return localStorage.getItem('collapse_income') === 'true' } catch { return false }
    })
    const expenseTotals = useMemo(() => {
      const map = new Map()
      for (const c of expenseCats) map.set(c, 0)
      for (const t of filteredTxns) {
        if (t.type !== 'expense') continue
        const key = t.category || 'Other'
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0) - reimbursed)
      }
      return map
    }, [filteredTxns, expenseCats])

    const incomeTotals = useMemo(() => {
      const map = new Map()
      for (const c of incomeCats) map.set(c, 0)
      for (const t of filteredTxns) {
        if (t.type !== 'income') continue
        if (t.reimbursementOf) continue
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }

      // Add Capital Gains
      // Add Capital Gains
      const assets = accounts.filter(a => {
        const g = activeLedger.groups.find(g => g.id === a.groupId);
        return g && g.type === 'asset';
      });
      let totalGains = 0;
      for (const acc of assets) {
        const info = calculateAssetMetrics(acc, accountTxns, 'asset');
        const monthsGains = info.realizedGains.filter(g => monthKey(g.date) === month);
        for (const g of monthsGains) {
          const cat = g.category || 'Capital Gains';
          map.set(cat, (map.get(cat) || 0) + g.amount);
        }
      }

      return map
    }, [filteredTxns, incomeCats, accounts, activeLedger.groups, accountTxns, month])

    useEffect(() => {
      try { localStorage.setItem('collapse_income', String(collapseIncome)) } catch { }
    }, [collapseIncome])

    const [draggingCat, setDraggingCat] = useState(null) // { type, name }
    const [dragOverCat, setDragOverCat] = useState(null) // name (string)

    function handleDragStart(type, name) {
      setDraggingCat({ type, name })
    }

    function handleDragOver(e, type, name) {
      e.preventDefault()
      if (draggingCat && draggingCat.type === type && dragOverCat !== name) {
        setDragOverCat(name)
      }
    }

    function handleDrop(type, targetName) {
      if (!draggingCat || draggingCat.type !== type) return

      const list = type === 'expense' ? expenseCats : incomeCats
      const fromIndex = list.indexOf(draggingCat.name)
      const toIndex = list.indexOf(targetName)

      if (fromIndex < 0 || toIndex < 0) {
        setDraggingCat(null)
        setDragOverCat(null)
        return
      }

      const next = [...list]
      next.splice(fromIndex, 1)
      next.splice(toIndex, 0, draggingCat.name)

      const nextCategories = {
        ...categories,
        [type]: next
      }
      persistActiveLedger({ ...activeLedger, categories: nextCategories })
      setDraggingCat(null)
      setDragOverCat(null)
    }

    function addCategory(type) {
      const name = prompt(`New ${type} category name?`)
      if (!name) return
      const trimmed = name.trim()
      if (!trimmed) return
      const list = type === 'expense' ? expenseCats : incomeCats
      if (list.some(c => c.toLowerCase() === trimmed.toLowerCase())) return
      const next = [...list, trimmed]
      const nextCategories = {
        ...categories,
        [type]: next
      }
      const nextMeta = {
        ...categoryMeta,
        [type]: {
          ...categoryMeta[type],
          [trimmed]: { budget: 0, subs: [] }
        }
      }
      persistActiveLedger({ ...activeLedger, categories: nextCategories, categoryMeta: nextMeta })
    }

    function editCategory(type) {
      const list = type === 'expense' ? expenseCats : incomeCats
      if (!list.length) return
      const from = prompt(`Rename which ${type} category?\n${list.join(', ')}`)
      if (!from) return
      const oldName = from.trim()
      if (!oldName || !list.includes(oldName)) return
      const to = prompt(`Rename "${oldName}" to?`)
      if (!to) return
      const newName = to.trim()
      if (!newName || newName === oldName) return
      if (list.some(c => c.toLowerCase() === newName.toLowerCase())) return

      const nextList = list.map(c => (c === oldName ? newName : c))
      const nextCategories = {
        ...categories,
        [type]: nextList
      }
      const nextMeta = {
        ...categoryMeta,
        [type]: {
          ...categoryMeta[type]
        }
      }
      if (nextMeta[type]?.[oldName]) {
        nextMeta[type][newName] = nextMeta[type][oldName]
        delete nextMeta[type][oldName]
      }
      const nextTxns = txns.map(t => (
        t.type === type && t.category === oldName
          ? { ...t, category: newName }
          : t
      ))
      persistActiveLedger({
        ...activeLedger,
        txns: nextTxns,
        categories: nextCategories,
        categoryMeta: nextMeta
      })
    }

    if (selectedCategory) {
      return (
        <CategoryDetail
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
          onAdd={(amount, note, accountId, date, subAccountId) =>
            addQuickTxn({
              type: selectedCategory.type,
              amount,
              category: selectedCategory.name,
              note,
              accountId,
              date,
              subAccountId
            })
          }
          total={selectedCategory.type === 'expense'
            ? (expenseTotals.get(selectedCategory.name) || 0)
            : (incomeTotals.get(selectedCategory.name) || 0)
          }
          meta={categoryMeta[selectedCategory.type]?.[selectedCategory.name]}
          onUpdateMeta={(next) => {
            const nextMeta = {
              ...categoryMeta,
              [selectedCategory.type]: {
                ...categoryMeta[selectedCategory.type],
                [selectedCategory.name]: next
              }
            }
            persistActiveLedger({ ...activeLedger, categoryMeta: nextMeta })
          }}
        />
      )
    }

    return (
      <div className="ledgerScreen">
        <div className="ledgerHeader">
          <button className="ledgerGhost" type="button" onClick={() => setShowLedgerPicker(true)}>
            {activeLedger.name || 'Personal'} ▾
          </button>
          <div className="ledgerPeriod">
            <button className="ledgerNavBtn" onClick={() => shiftMonth(-1)} type="button">
              ‹
            </button>
            <div className="ledgerPeriodLabel">{monthLabel}</div>
            <button className="ledgerNavBtn" onClick={() => shiftMonth(1)} type="button">
              ›
            </button>
          </div>
          <div className="ledgerRatio">
            <span>{kpis.inc ? ((kpis.exp / kpis.inc) * 100).toFixed(2) : '0.00'}%</span>
            <span className="ledgerRatioDot">◔</span>
          </div>
        </div>

        <div className={`ledgerSummary ${kpis.inc - kpis.exp < 0 ? 'neg' : 'pos'}`}>
          <div className="ledgerSummaryLabel">Balance</div>
          <div className="ledgerSummaryValue">{fmtTZS(kpis.inc - kpis.exp)}</div>
          <span className="ledgerSummaryCaret">▾</span>
        </div>

        {showLedgerPicker && (
          <div className="ledgerPickerBackdrop" onClick={() => setShowLedgerPicker(false)}>
            <div className="ledgerPickerCard" onClick={(e) => e.stopPropagation()}>
              <div className="ledgerPickerTitle">Ledgers</div>
              <div className="ledgerPickerList">
                {ledgers.map(l => (
                  <button
                    key={l.id}
                    className={`ledgerPickerItem ${l.id === activeLedger.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleSelectLedger(l.id)}
                  >
                    <span className="ledgerPickerName">{l.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        className="miniBtn"
                        type="button"
                        style={{ padding: '2px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          const newName = prompt("Rename ledger:", l.name)
                          if (newName && newName.trim() && newName.trim() !== l.name) {
                            handleUpdateLedger(l.id, { name: newName.trim() })
                          }
                        }}
                      >
                        Edit
                      </button>
                      <span className="ledgerPickerCheck">
                        {l.id === activeLedger.id ? '✓' : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <button className="ledgerPickerAdd" type="button" onClick={handleAddLedger}>
                + Add Ledger
              </button>
            </div>
          </div>
        )}

        <div className="ledgerSection">
          <div className="ledgerSectionHead">
            <div className="ledgerSectionTitle">
              Income <span className="ledgerSectionTotal">{fmtTZS(kpis.inc)}</span>
            </div>
            <div className="ledgerSectionActions">
              <button className="ledgerAddBtn" onClick={() => addCategory('income')} type="button">
                + Add
              </button>
              <button
                className="ledgerCollapseBtn"
                type="button"
                onClick={() => setCollapseIncome(v => !v)}
              >
                {collapseIncome ? '▸' : '▾'}
              </button>
            </div>
          </div>
          {!collapseIncome && (
            <div className="ledgerGrid">
              {incomeCats.map((c, i) => (
                <div
                  className={`ledgerCard theme-${(i % 6) + 4} ${draggingCat?.name === c ? 'dragging' : ''} ${dragOverCat === c ? 'dragOver' : ''}`}
                  key={c}
                  draggable
                  onDragStart={() => handleDragStart('income', c)}
                  onDragOver={(e) => handleDragOver(e, 'income', c)}
                  onDrop={() => handleDrop('income', c)}
                  onDragEnd={() => { setDraggingCat(null); setDragOverCat(null); }}
                  style={categoryMeta.income?.[c]?.color ? { background: categoryMeta.income[c].color } : undefined}
                  onClick={() => setSelectedCategory({ type: 'income', name: c })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedCategory({ type: 'income', name: c })
                    }
                  }}
                >
                  <div className="ledgerCardTitle">{c}</div>
                  <div className="ledgerCardIcon">{c.slice(0, 1).toUpperCase()}</div>
                  <div className="ledgerCardValue">{fmtTZS(incomeTotals.get(c) || 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ledgerSection">
          <div className="ledgerSectionHead">
            <div className="ledgerSectionTitle">
              Expenses <span className="ledgerSectionTotal">{fmtTZS(kpis.exp)}</span>
            </div>
            <div className="ledgerSectionActions">
              <button className="ledgerAddBtn" onClick={() => addCategory('expense')} type="button">
                + Add
              </button>
              <button
                className="ledgerCollapseBtn"
                type="button"
                onClick={() => setCollapseExpense(v => !v)}
              >
                {collapseExpense ? '▸' : '▾'}
              </button>
            </div>
          </div>
          {!collapseExpense && (
            <div className="ledgerGrid">
              {expenseCats.map((c, i) => {
                const meta = categoryMeta.expense?.[c] || { budget: 0, subs: [] }
                const spent = expenseTotals.get(c) || 0
                const ratio = meta.budget > 0 ? spent / meta.budget : 0
                const progress = Math.min(ratio * 100, 100)
                const progressColor = ratio >= 1 ? '#e24b4b' : '#2fbf71'
                return (
                  <div
                    className={`ledgerCard theme-${(i % 9) + 1} ${draggingCat?.name === c ? 'dragging' : ''} ${dragOverCat === c ? 'dragOver' : ''}`}
                    key={c}
                    draggable
                    onDragStart={() => handleDragStart('expense', c)}
                    onDragOver={(e) => handleDragOver(e, 'expense', c)}
                    onDrop={() => handleDrop('expense', c)}
                    onDragEnd={() => { setDraggingCat(null); setDragOverCat(null); }}
                    style={{
                      '--progress': `${progress}%`,
                      '--progress-color': progressColor,
                      ...(categoryMeta.expense?.[c]?.color ? { background: categoryMeta.expense[c].color } : {})
                    }}
                    onClick={() => setSelectedCategory({ type: 'expense', name: c })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedCategory({ type: 'expense', name: c })
                      }
                    }}
                  >
                    <div className="ledgerCardTitle">{c}</div>
                    <div className="ledgerCardIcon">{c.slice(0, 1).toUpperCase()}</div>
                    <div className="ledgerCardValue">{fmtTZS(expenseTotals.get(c) || 0)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  function CategoryDetail({ category, onClose, onAdd, total, meta, onUpdateMeta }) {
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [date, setDate] = useState(todayISO())
    const [accountId, setAccountId] = useState('')
    const [selectedSub, setSelectedSub] = useState('')
    const [subAccountId, setSubAccountId] = useState('')
    const [showReimburseModal, setShowReimburseModal] = useState(false)
    const [reimburseTxn, setReimburseTxn] = useState(null)
    const [reimburseAmount, setReimburseAmount] = useState('')
    const [reimburseAccountId, setReimburseAccountId] = useState('')
    const [reimburseSubAccountId, setReimburseSubAccountId] = useState('')
    const [reimburseDate, setReimburseDate] = useState(todayISO())
    const [reimburseError, setReimburseError] = useState(false)

    const reimburseAccount = accounts.find(a => a.id === reimburseAccountId)
    const showReimburseSubSelect = reimburseAccount && Array.isArray(reimburseAccount.subAccounts) && reimburseAccount.subAccounts.length > 0

    useEffect(() => {
      if (!reimburseAccountId) { setReimburseSubAccountId(''); return }
      const acct = accounts.find(a => a.id === reimburseAccountId)
      if (acct && Array.isArray(acct.subAccounts)) {
        const match = acct.subAccounts.find(s => s.ledgerId === activeLedgerId)
        if (match) { setReimburseSubAccountId(match.id); return }
      }
      setReimburseSubAccountId('')
    }, [reimburseAccountId, activeLedgerId])

    // Reset subAccountId when accountId changes, defaulting to Active Ledger if possible
    useEffect(() => {
      if (!accountId) {
        setSubAccountId('')
        return
      }
      const acct = accounts.find(a => a.id === accountId)
      if (acct && Array.isArray(acct.subAccounts)) {
        const match = acct.subAccounts.find(s => s.ledgerId === activeLedgerId)
        if (match) {
          setSubAccountId(match.id)
          return
        }
      }
      setSubAccountId('')
    }, [accountId, activeLedgerId])

    const selectedAccount = accounts.find(a => a.id === accountId)
    const showSubAccountSelect = selectedAccount && Array.isArray(selectedAccount.subAccounts) && selectedAccount.subAccounts.length > 0
    const [selectedTxn, setSelectedTxn] = useState(null)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editName, setEditName] = useState(category.name)
    const [editColor, setEditColor] = useState(meta?.color || '')
    const budget = meta?.budget || 0
    const subcats = meta?.subs?.length ? meta.subs : (CATEGORY_SUBS[category.name] || [])
    const colorOptions = [
      '#ffe8b6',
      '#ffe0cf',
      '#ffd9ec',
      '#e8dcff',
      '#dbeaff',
      '#e6f3ff',
      '#dff5e1',
      '#fff1c9',
      '#f0efe9'
    ]

    const spent = total
    const ratio = budget > 0 ? spent / budget : 0
    const pct = budget > 0 ? Math.min(ratio * 100, 999).toFixed(1) : '0.0'
    const left = budget > 0 ? Math.max(budget - spent, 0) : 0
    const over = budget > 0 ? Math.max(spent - budget, 0) : 0

    const recentTxns = useMemo(() => {
      // 1. Regular transactions
      const regular = filteredTxns
        .filter(t => t.category === category.name)
        .map(t => ({ ...t, _sortDate: t.date, _isGain: false }))

      // 2. Realized Gains (if Income)
      let gains = []
      if (category.type === 'income') {
        const assets = accounts.filter(a => {
          const g = activeLedger.groups.find(g => g.id === a.groupId);
          return g && g.type === 'asset';
        });

        for (const acc of assets) {
          const info = calculateAssetMetrics(acc, accountTxns, 'asset');
          const catGains = info.realizedGains.filter(g => {
            const cat = g.category || 'Capital Gains';
            return cat === category.name;
          });

          gains = gains.concat(catGains.map(g => ({
            id: `gain-${g.date}-${g.symbol}`, // pseudo ID
            date: g.date,
            amount: g.amount,
            category: category.name,
            type: 'income',
            note: `Gain from ${g.symbol}`,
            _sortDate: g.date,
            _isGain: true
          })));
        }
      }

      return [...regular, ...gains]
        .sort((a, b) => (a._sortDate < b._sortDate ? 1 : -1))
        .slice(0, 50)
    }, [filteredTxns, category.name, accounts, activeLedger.groups, accountTxns])

    const groupedRecent = useMemo(() => {
      const map = new Map()
      for (const t of recentTxns) {
        if (!map.has(t.date)) map.set(t.date, [])
        map.get(t.date).push(t)
      }
      return Array.from(map.entries())
    }, [recentTxns])

    function openTxnDetail(t) {
      setSelectedTxn({
        id: `txn-${t.id}`,
        date: t.date,
        title: t.category || (t.type === 'income' ? 'Income' : 'Expense'),
        sub: t.note || '',
        amount: Number(t.amount || 0),
        direction: t.type === 'income' ? 'in' : 'out',
        type: t.type,
        category: t.category || '',
        accountId: t.accountId || '',
        note: t.note || '',
        kind: 'txn',
        raw: t
      })
    }

    function addSubcategory() {
      const name = prompt('Subcategory name?')
      if (!name) return
      const trimmed = name.trim()
      if (!trimmed) return
      const next = Array.from(new Set([trimmed, ...subcats]))
      onUpdateMeta?.({ budget, subs: next })
    }

    function openEditModal() {
      setEditName(category.name)
      setEditColor(meta?.color || '')
      setShowEditModal(true)
    }

    function saveCategoryEdit() {
      const trimmed = editName.trim()
      if (!trimmed) return
      const list = category.type === 'expense' ? expenseCats : incomeCats
      if (
        trimmed !== category.name &&
        list.some(c => c.toLowerCase() === trimmed.toLowerCase())
      ) return

      const nextList = trimmed === category.name
        ? list
        : list.map(c => (c === category.name ? trimmed : c))
      const nextCategories = {
        ...categories,
        [category.type]: nextList
      }
      const nextMeta = {
        ...categoryMeta,
        [category.type]: {
          ...categoryMeta[category.type]
        }
      }
      const prevMeta = nextMeta[category.type]?.[category.name] || { budget, subs: subcats }
      if (trimmed !== category.name) {
        nextMeta[category.type][trimmed] = { ...prevMeta, color: editColor || '' }
        delete nextMeta[category.type][category.name]
      } else {
        nextMeta[category.type][category.name] = { ...prevMeta, color: editColor || '' }
      }
      const nextTxns = trimmed === category.name
        ? txns
        : txns.map(t => (
          t.type === category.type && t.category === category.name
            ? { ...t, category: trimmed }
            : t
        ))
      persistActiveLedger({
        ...activeLedger,
        txns: nextTxns,
        categories: nextCategories,
        categoryMeta: nextMeta
      })
      setShowEditModal(false)
      if (trimmed !== category.name) onClose()
    }

    function deleteCategory() {
      if (!confirm(`Delete "${category.name}"?`)) return
      const list = category.type === 'expense' ? expenseCats : incomeCats
      const nextList = list.filter(c => c !== category.name)
      const nextCategories = {
        ...categories,
        [category.type]: nextList
      }
      const nextMeta = {
        ...categoryMeta,
        [category.type]: {
          ...categoryMeta[category.type]
        }
      }
      if (nextMeta[category.type]?.[category.name]) {
        delete nextMeta[category.type][category.name]
      }
      const nextTxns = txns.map(t => (
        t.type === category.type && t.category === category.name
          ? { ...t, category: '' }
          : t
      ))
      persistActiveLedger({
        ...activeLedger,
        txns: nextTxns,
        categories: nextCategories,
        categoryMeta: nextMeta
      })
      onClose()
    }

    function updateBudget(value) {
      const nextBudget = Number(value || 0)
      onUpdateMeta?.({ budget: nextBudget, subs: subcats })
    }

    if (selectedTxn) {
      return (
        <TransactionDetail
          txn={selectedTxn}
          accounts={accounts}
          expenseCats={expenseCats}
          incomeCats={incomeCats}
          onSave={(next) => updateTxn(selectedTxn.raw, next)}
          onClose={() => setSelectedTxn(null)}
          onDelete={() => {
            delTxn(selectedTxn.raw.id)
            setSelectedTxn(null)
          }}
          onReimburse={selectedTxn.type === 'expense' ? () => {
            const t = selectedTxn.raw
            setSelectedTxn(null)
            setReimburseTxn(t)
            const alreadyReimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
            setReimburseAmount(String(Number(t.amount || 0) - alreadyReimbursed))
            setReimburseAccountId('')
            setReimburseSubAccountId('')
            setReimburseDate(todayISO())
            setShowReimburseModal(true)
          } : null}
        />
      )
    }

    return (
      <div className="catDetailScreen">
        <div className="catDetailHeader">
          <button className="iconBtn" onClick={onClose} type="button">✕</button>
          <div className="catDetailTitle">{category.name}</div>
          <div className="catDetailActions">
            <button className="pillBtn" type="button" onClick={openEditModal}>Edit</button>
            <button className="pillBtn danger" type="button" onClick={deleteCategory}>Delete</button>
          </div>
        </div>

        <div className="catDetailTotal">{fmtTZS(total)}</div>

        <div className={`catDetailStats ${budget > 0 && ratio >= 1 ? 'over' : 'ok'}`}>
          <div>
            <div className="catDetailStatValue">{fmtTZS(spent)}</div>
            <div className="catDetailStatLabel">{budget > 0 ? `${pct}% Spent` : 'Spent'}</div>
          </div>
          <div>
            <div className="catDetailStatValue">{fmtTZS(budget > 0 ? left : 0)}</div>
            <div className="catDetailStatLabel">
              {budget > 0 ? (over > 0 ? `${pct}% Exceeding` : `${(100 - Math.min(ratio * 100, 100)).toFixed(1)}% Left`) : 'No budget'}
            </div>
          </div>
        </div>

        {subcats.length > 0 && (
          <div className="catDetailChips">
            {subcats.map(s => (
              <button
                className={`catChip ${selectedSub === s ? 'active' : ''}`}
                key={s}
                type="button"
                onClick={() => setSelectedSub(s)}
              >
                {s}
              </button>
            ))}
            <button className="catChip gear" type="button" onClick={addSubcategory}>⚙</button>
          </div>
        )}

        {subcats.length === 0 && (
          <div className="catDetailChips">
            <button className="catChip gear" type="button" onClick={addSubcategory}>+ Add subcategory</button>
          </div>
        )}

        <div className="catDetailForm">
          <div className="field">
            <label>Amount (TZS)</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 10000"
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>



          <div className="field">
            <label>Account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Select account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {showSubAccountSelect && (
            <div className="field">
              <label>Sub-account</label>
              <select value={subAccountId} onChange={e => setSubAccountId(e.target.value)}>
                <option value="">Select sub-account</option>
                {selectedAccount.subAccounts
                  // Filter valid sub-accounts for the current ledger if applicable, 
                  // but here we rely on the component receiving active accounts only.
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>
          )}

          <div className="field">
            <label>Note (optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Bus fare"
            />
          </div>
          <div className="catDetailActionsRow">
            <button
              className="btn addTxnBtn"
              type="button"
              onClick={() => {
                const combinedNote = selectedSub
                  ? `${selectedSub}${note ? ` • ${note}` : ''}`
                  : note
                onAdd(amount, combinedNote, accountId, date, subAccountId) // Added subAccountId
                setAmount('')
                setNote('')
                setDate(todayISO())
                setAccountId('')
                setSubAccountId('')
              }}
            >
              Add {category.type === 'expense' ? 'Expense' : 'Income'}
            </button>
          </div>
        </div>

        <div className="catDetailHistory">
          <div className="catDetailHistoryTitle">Recent {category.name}</div>
          {groupedRecent.length === 0 ? (
            <div className="emptyRow">No transactions yet.</div>
          ) : (
            groupedRecent.map(([date, items]) => {
              const total = items.reduce((s, t) => s + Number(t.amount || 0), 0)
              return (
                <div className="catDetailHistoryCard" key={date}>
                  <div className="catHistoryHead">
                    <div>{new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                    <div className="catHistoryTotals">
                      <span className={category.type === 'income' ? 'in' : 'out'}>
                        {category.type === 'income' ? 'IN' : 'OUT'} {fmtTZS(total)}
                      </span>
                    </div>
                  </div>
                  <div className="catHistoryBody">
                    {items.map(t => {
                      const acct = t.accountId && accounts.find(a => a.id === t.accountId)
                      return (
                        <div
                          className="catHistoryRow"
                          key={t.id}
                          onClick={() => openTxnDetail(t)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') openTxnDetail(t)
                          }}
                        >
                          <div className="catHistoryIcon">{category.name.slice(0, 1).toUpperCase()}</div>
                          <div className="catHistoryInfo">
                            <div className="catHistoryTitleRow">{t.note || category.name}</div>
                            <div className="catHistoryMeta">{acct ? acct.name : 'No account'}</div>
                            {category.type === 'expense' && t.reimbursedBy && t.reimbursedBy.length > 0 && (
                              <div className="reimbursedBadge">
                                ✓ Reimbursed {fmtTZS(t.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))}
                              </div>
                            )}
                          </div>
                          <div className={`catHistoryAmount ${category.type === 'income' ? 'pos' : 'neg'}`}>
                            {category.type === 'income' ? '+' : '-'}{fmtTZS(t.amount)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {
          showEditModal && (
            <div className="modalBackdrop" onClick={() => setShowEditModal(false)}>
              <div className="modalCard" onClick={(e) => e.stopPropagation()}>
                <div className="modalTitle">Edit Category</div>
                <div className="field">
                  <label>Name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Background color</label>
                  <div className="colorPickerRow">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`colorSwatch ${editColor === color ? 'active' : ''}`}
                        style={{ background: color }}
                        onClick={() => setEditColor(color)}
                        aria-label={`Pick ${color}`}
                      />
                    ))}
                    <button
                      type="button"
                      className={`colorSwatch custom ${!editColor ? 'active' : ''}`}
                      onClick={() => setEditColor('')}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="modalActions">
                  <button className="btn" type="button" onClick={() => setShowEditModal(false)}>
                    Cancel
                  </button>
                  <button className="btn primary" type="button" onClick={saveCategoryEdit}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {showReimburseModal && reimburseTxn && (
          <div className="modalBackdrop" onClick={() => setShowReimburseModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Reimburse</div>
              <div className="reimburseOriginal">
                <div className="reimburseOriginalLabel">Original Expense</div>
                <div className="reimburseOriginalInfo">
                  <span>{reimburseTxn.note || reimburseTxn.category || 'Expense'}</span>
                  <span className="reimburseOriginalAmt">{fmtTZS(reimburseTxn.amount)}</span>
                </div>
                {reimburseTxn.reimbursedBy && reimburseTxn.reimbursedBy.length > 0 && (
                  <div className="reimburseAlready">
                    Already reimbursed: {fmtTZS(reimburseTxn.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))}
                  </div>
                )}
              </div>
              <div className="accQuickForm">
                <div className="field">
                  <label>Reimbursement Amount (TZS) — Max: {fmtTZS(Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0))}</label>
                  <input
                    inputMode="decimal"
                    value={reimburseAmount}
                    onChange={e => {
                      const max = Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                      const val = Number(e.target.value || 0)
                      if (val > max) setReimburseAmount(String(max))
                      else setReimburseAmount(e.target.value)
                    }}
                    placeholder="e.g. 10000"
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={reimburseDate}
                    onChange={e => setReimburseDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label style={reimburseError ? { color: '#e24b4b' } : undefined}>Receive Into Account {reimburseError ? '— Required' : ''}</label>
                  <select
                    value={reimburseAccountId}
                    onChange={e => { setReimburseAccountId(e.target.value); setReimburseError(false) }}
                    style={reimburseError ? { borderColor: '#e24b4b', background: 'rgba(226,75,75,0.05)' } : undefined}
                  >
                    <option value="">Select account</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                {showReimburseSubSelect && (
                  <div className="field">
                    <label>Sub-account</label>
                    <select value={reimburseSubAccountId} onChange={e => setReimburseSubAccountId(e.target.value)}>
                      <option value="">Select sub-account</option>
                      {reimburseAccount.subAccounts.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="modalActions">
                  <button className="btn" type="button" onClick={() => setShowReimburseModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => {
                      if (!reimburseAccountId) {
                        setReimburseError(true)
                        return
                      }
                      addReimbursement({
                        originalTxnId: reimburseTxn.id,
                        amount: reimburseAmount,
                        accountId: reimburseAccountId,
                        subAccountId: reimburseSubAccountId,
                        date: reimburseDate
                      })
                      setReimburseError(false)
                      setShowReimburseModal(false)
                      setReimburseTxn(null)
                    }}
                  >
                    Save Reimbursement
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div >
    )
  }

  function TransactionsScreen() {
    const [txTab, setTxTab] = useState('monthly') // daily, monthly, stats
    const [statYear, setStatYear] = useState(() => new Date().getFullYear())
    const periodLabel = useMemo(() => formatMonthLabel(month), [month])
    const [selectedTxn, setSelectedTxn] = useState(null)

    const combinedTxns = useMemo(() => {
      const baseTxns = filteredTxns.map(t => ({
        id: `txn-${t.id}`,
        date: t.date,
        title: t.category || (t.type === 'income' ? 'Income' : 'Expense'),
        sub: t.note || '',
        amount: Number(t.amount || 0),
        direction: t.type === 'income' ? 'in' : 'out',
        type: t.type,
        category: t.category || '',
        accountId: t.accountId || '',
        note: t.note || '',
        kind: 'txn',
        raw: t
      }))

      // Exclude account txns that mirror ledger txns (kind === 'txn') to avoid duplicates
      const acctTxns = filteredAccountTxns
        .filter(t => t.kind !== 'txn')
        .map(t => {
          const acct = accounts.find(a => a.id === t.accountId)
          const other = t.relatedAccountId && accounts.find(a => a.id === t.relatedAccountId)
          const title = t.kind === 'transfer'
            ? `Transfer ${t.direction === 'out' ? 'to' : 'from'} ${other ? other.name : 'account'}`
            : (t.note || 'Balance update')
          return {
            id: `acct-${t.id}`,
            date: t.date,
            title,
            sub: acct ? acct.name : '',
            amount: Number(t.amount || 0),
            direction: t.direction,
            type: t.direction === 'in' ? 'income' : 'expense',
            category: acct ? acct.name : 'Account',
            accountId: t.accountId || '',
            note: t.note || '',
            kind: 'account',
            raw: t
          }
        })

      return [...baseTxns, ...acctTxns].sort((a, b) => (a.date < b.date ? 1 : -1))
    }, [filteredTxns, filteredAccountTxns, accounts])

    const groupedTxns = useMemo(() => {
      const map = new Map()
      for (const t of combinedTxns) {
        if (!map.has(t.date)) map.set(t.date, [])
        map.get(t.date).push(t)
      }
      return Array.from(map.entries())
    }, [combinedTxns])

    const monthlyStats = useMemo(() => {
      // Aggregate by month for the selected year
      const stats = new Map() // 'YYYY-MM' -> { inc, exp }

      // Only use txns (Category transactions), ignore account adjustments/transfers
      txns.forEach(t => {
        const date = t.date || todayISO()
        const y = Number(date.slice(0, 4))
        if (y !== statYear) return
        const key = date.slice(0, 7)
        if (!stats.has(key)) stats.set(key, { inc: 0, exp: 0 })
        const entry = stats.get(key)

        const amt = Number(t.amount || 0)
        if (t.type === 'income') {
          if (!t.reimbursementOf) entry.inc += amt
        } else if (t.type === 'expense') {
          const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
          entry.exp += amt - reimbursed
        }
      })

      // Add Realized Gains
      const assets = accounts.filter(a => {
        const g = activeLedger.groups.find(g => g.id === a.groupId);
        return g && g.type === 'asset';
      });

      for (const acc of assets) {
        // We need all txns for this account to calculate WAC
        const info = calculateAssetMetrics(acc, accountTxns, 'asset');
        for (const g of info.realizedGains) {
          const date = g.date || todayISO();
          const y = Number(date.slice(0, 4));
          if (y !== statYear) continue;

          const key = date.slice(0, 7);
          if (!stats.has(key)) stats.set(key, { inc: 0, exp: 0 });
          const entry = stats.get(key);
          entry.inc += g.amount;
        }
      }

      // Fill in all months for the year
      const result = []
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0')
        const key = `${statYear}-${mm}`
        const dateObj = new Date(statYear, m - 1, 1)
        const monthName = dateObj.toLocaleString('default', { month: 'long' })
        const data = stats.get(key) || { inc: 0, exp: 0 }
        result.push({
          key,
          label: monthName,
          ...data,
          bal: data.inc - data.exp
        })
      }
      return result.reverse() // Dec to Jan
    }, [statYear, txns, accounts, activeLedger.groups, accountTxns])

    if (selectedTxn) {
      return (
        <TransactionDetail
          txn={selectedTxn}
          accounts={accounts}
          expenseCats={expenseCats}
          incomeCats={incomeCats}
          onSave={(next) => updateTxn(selectedTxn.raw, next)}
          onClose={() => setSelectedTxn(null)}
        />
      )
    }

    return (
      <div className="txScreen">
        <div className="txHeader">
          <div className="txLeft">
            <button className="ledgerGhost" type="button" onClick={() => setShowLedgerPicker(true)}>
              {activeLedger.name || 'Personal'} ▾
            </button>
          </div>

          <div className="txPeriod">
            {txTab === 'monthly' ? (
              <>
                <button className="txNavBtn" onClick={() => setStatYear(y => y - 1)} type="button">‹</button>
                <div className="txPeriodLabel">{statYear}</div>
                <button className="txNavBtn" onClick={() => setStatYear(y => y + 1)} type="button">›</button>
              </>
            ) : txTab === 'daily' ? (
              <>
                <button className="txNavBtn" onClick={() => shiftMonth(-1)} type="button">‹</button>
                <div className="txPeriodLabel">{periodLabel}</div>
                <button className="txNavBtn" onClick={() => shiftMonth(1)} type="button">›</button>
              </>
            ) : (
              <div className="txPeriodLabel">Statistics</div>
            )}
          </div>

          <div className="txActions">
            {txTab === 'daily' && (
              <>
                <button className="txIconBtn" type="button" title="Pick date">📅</button>
                <button className="txIconBtn" type="button" title="Filters">⏳</button>
              </>
            )}
          </div>
        </div>

        {showLedgerPicker && (
          <div className="ledgerPickerBackdrop" onClick={() => setShowLedgerPicker(false)}>
            <div className="ledgerPickerCard" onClick={(e) => e.stopPropagation()}>
              <div className="ledgerPickerTitle">Ledgers</div>
              <div className="ledgerPickerList">
                {ledgers.map(l => (
                  <button
                    key={l.id}
                    className={`ledgerPickerItem ${l.id === activeLedger.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => handleSelectLedger(l.id)}
                  >
                    <span className="ledgerPickerName">{l.name}</span>
                    {l.id === activeLedger.id && <span className="ledgerPickerCheck">✓</span>}
                  </button>
                ))}
              </div>
              <button className="ledgerPickerAdd" type="button" onClick={handleAddLedger}>
                + Add Ledger
              </button>
            </div>
          </div>
        )}

        {txTab === 'daily' && (
          <div className="txKpiBar">
            <div className="txKpiItem">
              <div className="txKpiLabel">Income</div>
              <div className="txKpiValue income">{fmtTZS(kpis.inc)}</div>
            </div>
            <div className="txKpiItem">
              <div className="txKpiLabel">Expense</div>
              <div className="txKpiValue expense">{fmtTZS(kpis.exp)}</div>
            </div>
            <div className="txKpiItem">
              <div className="txKpiLabel">Balance</div>
              <div className="txKpiValue">{fmtTZS(kpis.bal)}</div>
            </div>
          </div>
        )}

        <div className="txList">
          {txTab === 'daily' ? (
            groupedTxns.length === 0 ? (
              <div className="emptyRow">No transactions yet for {periodLabel}.</div>
            ) : (
              groupedTxns.map(([date, items]) => {
                const totals = items.reduce((s, t) => {
                  if (t.direction === 'in') s.in += t.amount
                  else s.out += t.amount
                  return s
                }, { in: 0, out: 0 })

                return (
                  <div className="txDayCard" key={date}>
                    <div className="txDayHead">
                      <div className="txDayDate">
                        <div className="dateYear">{new Date(date).getFullYear()}</div>
                        <div className="dateTop">
                          {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <div className="txDayTotals">
                        {totals.out > 0 && (
                          <div className="totalGroup">
                            <div className="totalLabel out">OUT</div>
                            <div className="totalValue out">{fmtTZS(totals.out)}</div>
                          </div>
                        )}
                        {totals.in > 0 && (
                          <div className="totalGroup">
                            <div className="totalLabel in">IN</div>
                            <div className="totalValue in">{fmtTZS(totals.in)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="txDayBody">
                      {items.map(t => (
                        <div className="txRow" key={t.id} onClick={() => setSelectedTxn(t)} role="button" tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSelectedTxn(t)
                          }}
                        >
                          <div className="txRowIcon">
                            {(t.title || 'T').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="txRowMain">
                            <div className="txRowTitle">{t.title}</div>
                            {t.sub && <div className="txRowSub">{t.sub}</div>}
                          </div>
                          <div className={'txRowAmount ' + (t.direction === 'in' ? 'pos' : 'neg')}>
                            {t.direction === 'in' ? '+' : '-'}{fmtTZS(t.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )
          ) : txTab === 'monthly' ? (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 320, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 8px' }}>Month</th>
                    <th style={{ textAlign: 'right', padding: '10px 4px' }}>Income</th>
                    <th style={{ textAlign: 'right', padding: '10px 4px' }}>Expr</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Bal</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totals = monthlyStats.reduce((acc, m) => ({
                      inc: acc.inc + m.inc,
                      exp: acc.exp + m.exp,
                      bal: acc.bal + m.bal
                    }), { inc: 0, exp: 0, bal: 0 })

                    return (
                      <tr style={{ fontWeight: 800, backgroundColor: 'var(--bg-2)', borderBottom: '2px solid var(--border)' }}>
                        <td style={{ padding: '12px 8px' }}>TOTAL</td>
                        <td style={{ textAlign: 'right', padding: '12px 4px', color: 'var(--income)' }}>{fmtCompact(totals.inc)}</td>
                        <td style={{ textAlign: 'right', padding: '12px 4px', color: 'var(--expense)' }}>{fmtCompact(totals.exp)}</td>
                        <td style={{ textAlign: 'right', padding: '12px 8px' }}>{fmtCompact(totals.bal)}</td>
                      </tr>
                    )
                  })()}
                  {monthlyStats.map(m => (
                    <tr key={m.key}>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: '#555' }}>
                        {m.label.slice(0, 3).toUpperCase()}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 4px', color: 'var(--ok)' }}>
                        {m.inc > 0 ? fmtTZS(m.inc) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 4px', color: 'var(--danger)' }}>
                        {m.exp > 0 ? fmtTZS(m.exp) : '-'}
                      </td>
                      <td style={{
                        textAlign: 'right',
                        padding: '10px 8px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        color: m.bal < 0 ? 'var(--danger)' : 'var(--text)'
                      }}>
                        {fmtTZS(m.bal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="emptyRow">Stats coming soon!</div>
          )}
        </div>

        <div className="txBottomTabs">
          <button className={txTab === 'daily' ? 'active' : ''} type="button" onClick={() => setTxTab('daily')}>Daily</button>
          <button className={txTab === 'monthly' ? 'active' : ''} type="button" onClick={() => setTxTab('monthly')}>Monthly</button>
          <button className={txTab === 'stats' ? 'active' : ''} type="button" onClick={() => setTxTab('stats')}>Stats</button>
        </div>
      </div>
    )
  }

  function TransactionDetail({ txn, accounts, expenseCats, incomeCats, onSave, onClose, onDelete, onReimburse }) {
    const isEditable = !txn.kind || txn.kind === 'txn'
    const [type, setType] = useState(txn.type || 'expense')
    const [amount, setAmount] = useState(String(txn.amount || ''))
    const [category, setCategory] = useState(txn.category || '')
    const [accountId, setAccountId] = useState(txn.accountId || '')
    const [date, setDate] = useState(txn.date || todayISO())

    const [subCategory, setSubCategory] = useState(() => {
      if (!txn.note) return ''
      const [head] = txn.note.split(' • ')
      return head || ''
    })
    const [note, setNote] = useState(() => {
      if (!txn.note) return ''
      const parts = txn.note.split(' • ')
      return parts.length > 1 ? parts.slice(1).join(' • ') : ''
    })

    const labelType = type === 'income' ? 'Income' : 'Expense'
    const categoryOptions = type === 'income' ? incomeCats : expenseCats

    function handleSave() {
      if (!isEditable) return
      const amt = Number(amount || 0)
      if (!amt || amt <= 0) return show('Enter a valid amount.')
      const combinedNote = subCategory
        ? `${subCategory}${note ? ` • ${note}` : ''}`
        : note
      onSave?.({
        ...txn.raw,
        type,
        amount: amt,
        category: category || '',
        note: combinedNote || '',
        accountId: accountId || '',
        date: date || todayISO()
      })
      onClose()
    }

    const accountName = accounts.find(a => a.id === accountId)?.name || ''
    return (
      <div className="txnDetailScreen">
        <div className="txnDetailHeader">
          <button className="iconBtn" onClick={onClose} type="button">✕</button>
          <div className="txnDetailTitle">Transactions</div>
          <div className="row" style={{ gap: 8 }}>
            {onDelete && isEditable && (
              <button className="pillBtn danger" type="button" onClick={() => {
                if (confirm('Delete this transaction?')) onDelete()
              }}>
                Delete
              </button>
            )}
            <button className="pillBtn" type="button" disabled={!isEditable} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>

        <div className={`txnAmountPill ${type === 'income' ? 'pos' : 'neg'}`}>
          {isEditable ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span>{type === 'income' ? '+' : '-'}</span>
              <input
                className="txnAmountInput"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          ) : (
            <>{type === 'income' ? '+' : '-'}{fmtTZS(amount || 0)}</>
          )}
        </div>

        <div className="txnDetailGrid">
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Type</div>
            {isEditable ? (
              <select className="txnDetailSelect" value={type} onChange={e => setType(e.target.value)}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            ) : (
              <div className="txnDetailValue">{labelType}</div>
            )}
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Category</div>
            {isEditable ? (
              <select className="txnDetailSelect" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">None</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <div className="txnDetailValue">{txn.category || 'None'}</div>
            )}
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Subcategory</div>
            {isEditable ? (
              <input
                className="txnDetailInput"
                value={subCategory}
                onChange={e => setSubCategory(e.target.value)}
                placeholder="None"
              />
            ) : (
              <div className="txnDetailValue">{txn.note ? txn.note.split(' • ')[0] : 'None'}</div>
            )}
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Tag</div>
            <div className="txnDetailValue">None</div>
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Account</div>
            {isEditable ? (
              <select className="txnDetailSelect" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">None</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <div className="txnDetailValue">{accountName || 'None'}</div>
            )}
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Recorder</div>
            <div className="txnDetailValue">You</div>
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Time</div>
            {isEditable ? (
              <input
                className="txnDetailInput"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            ) : (
              <div className="txnDetailValue">{txn.date}</div>
            )}
          </div>
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Exclude</div>
            <div className="txnDetailValue">None</div>
          </div>
        </div>

        {isEditable ? (
          <div className="txnDetailNote">
            <textarea
              className="txnDetailTextarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add note"
            />
          </div>
        ) : txn.note ? (
          <div className="txnDetailNote">
            {txn.note}
          </div>
        ) : null}

        {onReimburse && (
          <div style={{ padding: '12px 0' }}>
            {txn.raw?.reimbursedBy && txn.raw.reimbursedBy.length > 0 && (
              <div className="reimbursedBadge" style={{ marginBottom: 10, fontSize: 13, padding: '6px 12px' }}>
                ✓ Reimbursed {fmtTZS(txn.raw.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))}
              </div>
            )}
            <button
              className="btn primary"
              type="button"
              style={{ width: '100%' }}
              onClick={onReimburse}
            >
              Reimburse This Expense
            </button>
          </div>
        )}
      </div>
    )
  }

  function SettingsScreen() {
    return (
      <div className="card">
        <h2>Settings</h2>

        <div className="row">
          <button className="btn" onClick={handleExport}>Export (Encrypted)</button>

          <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Import
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])}
            />
          </label>

          <button className="btn danger" onClick={handleReset}>Reset</button>
          <button className="btn danger" onClick={handleWipeAll}>Clear All Data</button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Important: iPhone Safari storage can sometimes be cleared if space is low.
          Export backups regularly.
        </div>

        <div className="hr" />

        <div className="row">
          <button className="btn" onClick={() => setShowBudgetSettings(true)}>
            Monthly Budget
          </button>
        </div>

        <div className="hr" />

        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Cloud Backup (Google Drive)</div>
            <div className="small">Encrypted backup stored in your Google Drive app folder.</div>
            {cloudLastBackup && (
              <div className="small">Last backup: {cloudLastBackup.toLocaleString()}</div>
            )}
            {cloudStale && (
              <div className="small" style={{ color: '#d27b00' }}>
                Backup hasn’t run in {cloudWarnDays} days.
              </div>
            )}
            {cloudError && <div className="small" style={{ color: '#d25b5b' }}>{cloudError}</div>}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!cloudBackup.enabled}
              onChange={e => {
                const enabled = e.target.checked
                if (enabled && !cloudGoogle.refreshToken) {
                  startGoogleAuth()
                  return
                }
                updateSettings({
                  ...settings,
                  cloudBackup: {
                    ...cloudBackup,
                    enabled
                  }
                })
              }}
            />
            <span className="toggleTrack" />
          </label>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {!cloudGoogle.refreshToken ? (
            <button className="btn" onClick={startGoogleAuth} disabled={cloudBusy}>
              Connect Google Drive
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                updateSettings({
                  ...settings,
                  cloudBackup: {
                    ...cloudBackup,
                    enabled: false,
                    google: { ...cloudGoogle, refreshToken: '', latestFileId: null }
                  }
                })
                show('Disconnected from Google Drive.')
              }}
              disabled={cloudBusy}
            >
              Disconnect
            </button>
          )}
          <button className="btn" onClick={() => backupNow()} disabled={!cloudBackup.enabled || cloudBusy}>
            {cloudBusy ? 'Backing up…' : 'Backup now'}
          </button>
          <button className="btn" onClick={openRestorePicker} disabled={cloudBusy || !cloudGoogle.refreshToken}>
            Restore
          </button>
        </div>

        <div className="hr" />

        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>PIN lock</div>
            <div className="small">Require PIN to unlock the app.</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.pinLockEnabled}
              onChange={e => handlePinToggle(e.target.checked)}
            />
            <span className="toggleTrack" />
          </label>
        </div>

        <div className="hr" />

        <div className="row">
          <button className="btn" onClick={handleLoadDemo}>Load Demo Data</button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Demo data will overwrite your current accounts and account transactions.
        </div>

        <div className="hr" />

        <div className="row">
          <button
            className="btn"
            onClick={() => {
              if (!settings.pinLockEnabled) {
                show('PIN lock is disabled.')
                return
              }
              setStage('unlock')
              const fresh = normalizeVault(null)
              setVaultState({
                ...fresh,
                settings: { ...fresh.settings, pinLockEnabled: settings.pinLockEnabled }
              })
              show('Locked.')
            }}
          >
            Lock
          </button>
        </div>

        {toast && <div className="toast">{toast}</div>}

        {showRestoreModal && (
          <div className="modalBackdrop" onClick={() => setShowRestoreModal(false)}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Restore from Cloud</div>
              <div className="field">
                <label>Select backup</label>
                <select value={selectedRestoreId} onChange={e => setSelectedRestoreId(e.target.value)}>
                  {restoreFiles.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} • {new Date(f.modifiedTime).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>PIN</label>
                <input
                  type="password"
                  value={restorePin}
                  onChange={e => setRestorePin(e.target.value)}
                  placeholder="Enter your PIN"
                />
              </div>
              <div className="modalActions">
                <button className="btn" type="button" onClick={() => setShowRestoreModal(false)}>
                  Cancel
                </button>
                <button className="btn primary" type="button" onClick={restoreFromCloud} disabled={!selectedRestoreId || cloudBusy}>
                  Restore
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function BudgetSettings() {
    const [draftBudgets, setDraftBudgets] = useState(() => {
      const map = {}
      expenseCats.forEach(c => {
        const meta = categoryMeta.expense?.[c] || { budget: 0 }
        map[c] = meta.budget || 0
      })
      return map
    })
    const totalBudget = Object.values(draftBudgets).reduce((s, v) => s + Number(v || 0), 0)

    function handleSaveBudgets() {
      const nextMeta = {
        ...categoryMeta,
        expense: {
          ...categoryMeta.expense
        }
      }
      expenseCats.forEach(c => {
        const current = categoryMeta.expense?.[c] || { budget: 0, subs: [] }
        const nextBudget = Number(draftBudgets[c] || 0)
        nextMeta.expense[c] = { ...current, budget: nextBudget }
      })
      persistActiveLedger({ ...activeLedger, categoryMeta: nextMeta })
      setShowBudgetSettings(false)
      show('Budgets saved.')
    }

    return (
      <div className="modalBackdrop" onClick={() => setShowBudgetSettings(false)}>
        <div className="modalCard" onClick={(e) => e.stopPropagation()}>
          <div className="modalTitle">Monthly Budgets</div>
          <div className="budgetPill">Total budget: {fmtTZS(totalBudget)}</div>
          <div className="row" style={{ flexDirection: 'column', gap: 0 }}>
            {expenseCats.map(c => (
              <div className="field budgetRow" key={`budget-exp-${c}`}>
                <label>{c}</label>
                <input
                  inputMode="decimal"
                  value={draftBudgets[c] ?? ''}
                  onChange={e => {
                    const value = e.target.value
                    setDraftBudgets(prev => ({ ...prev, [c]: value }))
                  }}
                  placeholder="e.g. 500,000"
                />
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" type="button" onClick={() => setShowBudgetSettings(false)}>
              Cancel
            </button>
            <button className="btn primary" type="button" onClick={handleSaveBudgets}>
              Save Budgets
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Auth screens ----------
  if (stage === 'loading') return null

  if (stage === 'setpin') {
    return (
      <div className="container">
        <div className="pinWrap card">
          <div className="brand">
            <span className="dot" />
            <div>
              <div className="title">Kapapa Finance</div>
              <div className="subtitle">Private, offline-first finance tracker</div>
            </div>
          </div>
          <div className="hr" />
          <div className="pinTitle">Set your PIN</div>
          <div className="pinHint">
            Your data is stored only on this device/browser and is encrypted using your PIN.
            If you forget the PIN, there is no recovery (you can only reset).
          </div>

          <div className="field">
            <label>New PIN (min 4 characters)</label>
            <input value={pin} onChange={e => setPin(e.target.value)} placeholder="e.g. 1234" />
          </div>
          <div className="field">
            <label>Confirm PIN</label>
            <input value={pin2} onChange={e => setPin2(e.target.value)} placeholder="repeat PIN" />
          </div>

          <button className="btn primary" onClick={handleSetPin}>Create Vault</button>

          {toast && <div className="toast">{toast}</div>}
          <div className="small" style={{ marginTop: 10 }}>
            Tip: Use iPhone Face ID/Passcode + a PIN you can remember.
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'unlock') {
    return (
      <div className="container">
        <div className="pinWrap card">
          <div className="brand">
            <span className="dot" />
            <div>
              <div className="title">Kapapa Finance</div>
              <div className="subtitle">Enter PIN to unlock</div>
            </div>
          </div>
          <div className="hr" />
          <div className="field">
            <label>PIN</label>
            <input value={pin} onChange={e => setPin(e.target.value)} placeholder="Your PIN" />
          </div>
          <div className="row">
            <button className="btn primary" onClick={handleUnlock}>Unlock</button>
            <button className="btn danger" onClick={handleReset}>Reset</button>
          </div>
          {toast && <div className="toast">{toast}</div>}
          <div className="small" style={{ marginTop: 10 }}>
            Export/import is available after unlock (recommended).
          </div>
        </div>
      </div>
    )
  }

  // ---------- App shell ----------
  return (
    <div className="container">
      {/* Main content */}
      {tab === 'home' && <HomeScreen />}

      {tab === 'accounts' && (
        <div className="ledgerScreen">
          {showAccountsHeader && (
            <>
              <div className="ledgerHeader">
                <button className="ledgerGhost" type="button" onClick={() => setShowLedgerPicker(true)}>
                  {activeLedger.name || 'Personal'} ▾
                </button>
              </div>

              {showLedgerPicker && (
                <div className="ledgerPickerBackdrop" onClick={() => setShowLedgerPicker(false)}>
                  <div className="ledgerPickerCard" onClick={(e) => e.stopPropagation()}>
                    <div className="ledgerPickerTitle">Ledgers</div>
                    <div className="ledgerPickerList">
                      <button
                        className={`ledgerPickerItem ${activeLedgerId === ALL_LEDGERS_ID ? 'active' : ''}`}
                        type="button"
                        onClick={() => handleSelectLedger(ALL_LEDGERS_ID)}
                      >
                        <span className="ledgerPickerName">All Ledgers</span>
                        {activeLedgerId === ALL_LEDGERS_ID && <span className="ledgerPickerCheck">✓</span>}
                      </button>
                      {ledgers.map(l => (
                        <button
                          key={l.id}
                          className={`ledgerPickerItem ${l.id === activeLedgerId && activeLedgerId !== ALL_LEDGERS_ID ? 'active' : ''}`}
                          type="button"
                          onClick={() => handleSelectLedger(l.id)}
                        >
                          <span className="ledgerPickerName">{l.name}</span>
                          {l.id === activeLedgerId && activeLedgerId !== ALL_LEDGERS_ID && <span className="ledgerPickerCheck">✓</span>}
                        </button>
                      ))}
                    </div>
                    <button className="ledgerPickerAdd" type="button" onClick={handleAddLedger}>
                      + Add Ledger
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <AccountsScreen
            accounts={accounts}
            accountTxns={allAccountTxns}
            txns={activeLedger.txns || []}
            groups={activeLedger.groups || []}
            categories={activeLedger.categories}
            activeLedgerId={activeLedger.id}
            ledgers={ledgers}
            focusAccountId={focusAccountId}
            settings={settings}
            onUpdateSettings={updateSettings}
            onFocusAccountUsed={() => setFocusAccountId(null)}
            onSwitchLedger={handleSwitchLedgerToAccounts}
            onDetailOpen={() => setShowAccountsHeader(false)}
            onDetailClose={() => setShowAccountsHeader(true)}
            onToast={show}
            onUpsertAccount={upsertAccount}
            onDeleteAccount={deleteAccount}
            onAddAccountTxn={addAccountTxn}
            onTransferAccount={transferAccount}
            onUpdateAccountTxn={updateAccountTxn}
            onDeleteAccountTxn={deleteAccountTxn}
            onUpdateGroups={updateAccountGroups}
            onUpdateAccounts={updateAccounts}
          />
        </div>
      )}

      {tab === 'tx' && (
        <div className="ledgerScreen">
          <TransactionsScreen />
        </div>
      )}

      {tab === 'settings' && <SettingsScreen />}
      {showBudgetSettings && <BudgetSettings />}

      {/* Bottom tabs */}
      <BottomNav tab={tab} setTab={setTab} variant="light" />
    </div>
  )
}
