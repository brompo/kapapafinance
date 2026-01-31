import React, { useEffect, useMemo, useState } from 'react'
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
import { fmtTZS, monthKey, todayISO } from './money.js'

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

function uid(){
  return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16)
}

function createLedger({
  id = uid(),
  name = 'Personal',
  txns = [],
  accounts = [],
  accountTxns = [],
  categories,
  categoryMeta,
  groups
} = {}){
  const fallbackGroups = [
    { id: uid(), name: 'Debit', type: 'debit', collapsed: false },
    { id: uid(), name: 'Credit', type: 'credit', collapsed: false },
    { id: uid(), name: 'Investment', type: 'asset', collapsed: false }
  ]
  const normalizedGroups = Array.isArray(groups) && groups.length
    ? groups.map(g => ({
      id: g.id || uid(),
      name: g.name || 'Group',
      type: g.type === 'credit' ? 'credit' : (g.type === 'asset' ? 'asset' : 'debit'),
      collapsed: !!g.collapsed
    }))
    : fallbackGroups

  const groupById = new Map(normalizedGroups.map(g => [g.id, g]))
  const groupByType = new Map(normalizedGroups.map(g => [g.type, g]))
  const fallbackGroup = normalizedGroups[0]

  const normalizedAccounts = (Array.isArray(accounts) ? accounts : []).map(a => {
    if (a.groupId && groupById.has(a.groupId)) return a
    if (a.type && groupByType.has(a.type)) {
      return { ...a, groupId: groupByType.get(a.type).id }
    }
    return { ...a, groupId: fallbackGroup?.id }
  })

  return {
    id,
    name,
    txns: Array.isArray(txns) ? txns : [],
    accounts: normalizedAccounts,
    accountTxns: Array.isArray(accountTxns) ? accountTxns : [],
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

function normalizeLedger(data){
  if (!data || typeof data !== 'object') return createLedger()
  return createLedger({
    id: data.id || uid(),
    name: data.name || 'Personal',
    txns: data.txns,
    accounts: data.accounts,
    accountTxns: data.accountTxns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })
}

function isVaultEmpty(v){
  if (Array.isArray(v?.ledgers) && v.ledgers.length > 0){
    return v.ledgers.every(l =>
      (!l.txns || l.txns.length === 0) &&
      (!l.accounts || l.accounts.length === 0) &&
      (!l.accountTxns || l.accountTxns.length === 0)
    )
  }
  return (
    (!v.txns || v.txns.length === 0) &&
    (!v.accounts || v.accounts.length === 0) &&
    (!v.accountTxns || v.accountTxns.length === 0)
  )
}

function getSeedVault(){
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
    ],
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
    settings: { pinLockEnabled: false }
  }
}

// We now store an object in the encrypted vault (not just an array)
// { ledgers: [{...}], activeLedgerId: '', settings: { pinLockEnabled: false } }
function normalizeVault(data){
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
      settings: { pinLockEnabled: !!data.settings?.pinLockEnabled }
    }
  }

  const legacyLedger = createLedger({
    txns: data.txns,
    accounts: data.accounts,
    accountTxns: data.accountTxns,
    categories: data.categories,
    categoryMeta: data.categoryMeta
  })

  return {
    ledgers: [legacyLedger],
    activeLedgerId: legacyLedger.id,
    settings: { pinLockEnabled: !!data.settings?.pinLockEnabled }
  }
}

export default function App(){
  const [stage, setStage] = useState('loading') // loading | setpin | unlock | app
  const [tab, setTab] = useState('accounts') // home | accounts | tx | settings
  const [selectedCategory, setSelectedCategory] = useState(null) // { type, name }

  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [toast, setToast] = useState('')
  const [showLedgerPicker, setShowLedgerPicker] = useState(false)

  const [vault, setVaultState] = useState(() => normalizeVault(null))

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0,7))
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    category: 'Food',
    note: '',
    date: todayISO(),
    accountId: ''
  })

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

  function show(msg){
    setToast(msg)
    setTimeout(() => setToast(''), 3800)
  }

  async function handlePinToggle(nextEnabled){
    if (nextEnabled){
      if (!hasPin()){
        setStage('setpin')
        show('Set a PIN to enable lock.')
        return
      }
      const entered = pin || prompt('Enter your PIN to enable lock')
      if (!entered) return
      try{
        const data = normalizeVault(loadVaultPlain())
        const nextVault = { ...data, settings: { ...settings, pinLockEnabled: true } }
        setPin(entered)
        setVaultState(nextVault)
        await saveVault(entered, nextVault)
        localStorage.setItem(PIN_FLOW_KEY, 'true')
        show('PIN lock enabled.')
      } catch(e){
        show('Could not enable PIN lock.')
      }
      return
    }

    const entered = pin || (hasPin() ? prompt('Enter your PIN to disable lock') : '')
    if (hasPin() && !entered) return
    try{
      const data = hasPin() ? normalizeVault(await loadVault(entered)) : normalizeVault(loadVaultPlain())
      const nextVault = { ...data, settings: { ...settings, pinLockEnabled: false } }
      saveVaultPlain(nextVault)
      setVaultState(nextVault)
      localStorage.setItem(PIN_FLOW_KEY, 'false')
      setStage('app')
      setTab('home')
      show('PIN lock disabled.')
    } catch(e){
      show('Could not disable PIN lock.')
    }
  }

  async function handleSetPin(){
    try{
      if (!pin || pin.length < 4) return show('PIN must be at least 4 digits/characters.')
      if (pin !== pin2) return show('PINs do not match.')
      await setNewPin(pin)

      let data = normalizeVault(await loadVault(pin))
      if (!localStorage.getItem(SEED_KEY) && isVaultEmpty(data)){
        data = getSeedVault()
        localStorage.setItem(SEED_KEY, '1')
      }
      data = { ...data, settings: { ...data.settings, pinLockEnabled: true } }
      await saveVault(pin, data)
      localStorage.setItem(PIN_FLOW_KEY, 'true')
      setVaultState(data)

      setStage('app')
      setTab('accounts')
      show('PIN set. Vault created.')
    } catch(e){
      show(e.message || 'Failed to set PIN.')
    }
  }

  async function handleUnlock(){
    try{
      let data = normalizeVault(await loadVault(pin))
      if (!localStorage.getItem(SEED_KEY) && isVaultEmpty(data)){
        data = getSeedVault()
        localStorage.setItem(SEED_KEY, '1')
      }
      data = { ...data, settings: { ...data.settings, pinLockEnabled: true } }
      await saveVault(pin, data)
      localStorage.setItem(PIN_FLOW_KEY, 'true')
      setVaultState(data)

      setStage('app')
      setTab('accounts')
      show('Unlocked.')
    } catch(e){
      show('Wrong PIN or vault corrupted.')
    }
  }

  async function persist(nextVault){
    setVaultState(nextVault)
    try{
      if (settings.pinLockEnabled) await saveVault(pin, nextVault)
      else saveVaultPlain(nextVault)
    } catch(e){
      show('Could not save (are you locked?)')
    }
  }

  const settings = vault.settings || { pinLockEnabled: false }
  const ledgers = vault.ledgers || []
  const activeLedgerId = vault.activeLedgerId || ledgers[0]?.id || ''
  const activeLedger = ledgers.find(l => l.id === activeLedgerId) || ledgers[0] || createLedger()

  // ---------- Transactions ----------
  const txns = activeLedger.txns || []
  const accounts = activeLedger.accounts || []
  const accountTxns = activeLedger.accountTxns || []
  const categories = activeLedger.categories || {
    expense: [...DEFAULT_EXPENSE_CATEGORIES],
    income: [...DEFAULT_INCOME_CATEGORIES]
  }
  const categoryMeta = activeLedger.categoryMeta || { expense: {}, income: {} }

  const expenseCats = categories.expense || [...DEFAULT_EXPENSE_CATEGORIES]
  const incomeCats = categories.income || [...DEFAULT_INCOME_CATEGORIES]

  function persistActiveLedger(nextLedger){
    const nextLedgers = ledgers.map(l => (l.id === activeLedger.id ? nextLedger : l))
    persist({ ...vault, ledgers: nextLedgers, activeLedgerId: activeLedger.id })
  }

  function handleAddLedger(){
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

  function handleSelectLedger(id){
    if (!id || id === activeLedger.id) {
      setShowLedgerPicker(false)
      return
    }
    persist({ ...vault, activeLedgerId: id })
    setSelectedCategory(null)
    setShowLedgerPicker(false)
  }

  function formatMonthLabel(value){
    const d = new Date(`${value}-01`)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  function shiftMonth(delta){
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
      .sort((a,b) => (a.date < b.date ? 1 : -1))
  }, [txns, month])

  const filteredAccountTxns = useMemo(() => {
    return accountTxns
      .filter(t => monthKey(t.date) === month)
      .sort((a,b) => (a.date < b.date ? 1 : -1))
  }, [accountTxns, month])

  const kpis = useMemo(() => {
    let inc = 0, exp = 0
    for (const t of filteredTxns){
      const amt = Number(t.amount || 0)
      if (t.type === 'income') inc += amt
      else exp += amt
    }
    return { inc, exp, bal: inc - exp }
  }, [filteredTxns])

  async function addTxn(e){
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

    let nextAccounts = accounts
    let nextAccountTxns = accountTxns
    if (t.accountId){
      const acct = accounts.find(a => a.id === t.accountId || a.name === t.accountId)
      if (acct){
        const targetId = acct.id
        const delta = t.type === 'income' ? amt : -amt
        nextAccounts = accounts.map(a => (
          a.id === targetId ? { ...a, balance: Number(a.balance || 0) + delta } : a
        ))
        const entry = {
          id: uid(),
          accountId: targetId,
          amount: amt,
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date
        }
        nextAccountTxns = [entry, ...accountTxns]
      } else {
        show('Account not found for this transaction.')
      }
    }

    await persistActiveLedger({ ...activeLedger, txns: [t, ...txns], accounts: nextAccounts, accountTxns: nextAccountTxns })
    setForm(f => ({...f, amount:'', note:'', date: todayISO()}))
    show('Saved.')
  }

  async function addQuickTxn({ type, amount, category, note, accountId, date }){
    const amt = Number(amount || 0)
    if (!amt || amt <= 0) return show('Enter a valid amount.')

    const t = {
      id: uid(),
      type,
      amount: amt,
      category,
      note: note ? note.trim() : '',
      date: date || todayISO(),
      accountId: accountId || ''
    }

    let nextAccounts = accounts
    let nextAccountTxns = accountTxns
    if (t.accountId){
      const acct = accounts.find(a => a.id === t.accountId || a.name === t.accountId)
      if (acct){
        const targetId = acct.id
        const delta = t.type === 'income' ? amt : -amt
        nextAccounts = accounts.map(a => (
          a.id === targetId ? { ...a, balance: Number(a.balance || 0) + delta } : a
        ))
        const entry = {
          id: uid(),
          accountId: targetId,
          amount: amt,
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date
        }
        nextAccountTxns = [entry, ...accountTxns]
      } else {
        show('Account not found for this transaction.')
      }
    }

    await persistActiveLedger({ ...activeLedger, txns: [t, ...txns], accounts: nextAccounts, accountTxns: nextAccountTxns })
    show('Saved.')
  }

  function findAccountByIdOrName(idOrName){
    if (!idOrName) return null
    return accounts.find(a => a.id === idOrName || a.name === idOrName) || null
  }

  async function updateTxn(original, next){
    const nextTxns = txns.map(t => (t.id === original.id ? next : t))

    let nextAccounts = accounts
    const oldAccount = findAccountByIdOrName(original.accountId)
    const newAccount = findAccountByIdOrName(next.accountId)

    const oldDelta = original.type === 'income' ? Number(original.amount || 0) : -Number(original.amount || 0)
    const newDelta = next.type === 'income' ? Number(next.amount || 0) : -Number(next.amount || 0)

    if (oldAccount){
      nextAccounts = nextAccounts.map(a => (
        a.id === oldAccount.id ? { ...a, balance: Number(a.balance || 0) - oldDelta } : a
      ))
    }
    if (newAccount){
      nextAccounts = nextAccounts.map(a => (
        a.id === newAccount.id ? { ...a, balance: Number(a.balance || 0) + newDelta } : a
      ))
    }

    const nonTxnEntries = accountTxns.filter(t => t.kind !== 'txn')
    const txnEntries = nextTxns
      .filter(t => t.accountId)
      .map(t => {
        const acct = findAccountByIdOrName(t.accountId)
        if (!acct) return null
        return {
          id: `txn-${t.id}`,
          accountId: acct.id,
          amount: Number(t.amount || 0),
          direction: t.type === 'income' ? 'in' : 'out',
          kind: 'txn',
          relatedAccountId: null,
          note: t.note || t.category,
          date: t.date || todayISO()
        }
      })
      .filter(Boolean)

    await persist({
      ...vault,
      txns: nextTxns,
      accounts: nextAccounts,
      accountTxns: [...txnEntries, ...nonTxnEntries]
    })
    show('Updated.')
  }

  async function delTxn(id){
    const next = txns.filter(t => t.id !== id)
    await persistActiveLedger({ ...activeLedger, txns: next })
    show('Deleted.')
  }

  // ---------- Accounts ----------

  async function upsertAccount(acc){
    const next = [...accounts]
    const idx = next.findIndex(a => a.id === acc.id)
    if (idx >= 0) next[idx] = { ...next[idx], ...acc }
    else next.unshift(acc)
    await persistActiveLedger({ ...activeLedger, accounts: next })
    show('Account saved.')
  }

  async function deleteAccount(id){
    const next = accounts.filter(a => a.id !== id)
    const nextAccountTxns = accountTxns.filter(t => t.accountId !== id)
    await persistActiveLedger({ ...activeLedger, accounts: next, accountTxns: nextAccountTxns })
    show('Account deleted.')
  }

  async function addAccountTxn({ accountId, amount, direction, note, kind = 'adjust', relatedAccountId = null }){
    const acct = accounts.find(a => a.id === accountId)
    if (!acct) return

    const delta = direction === 'in' ? amount : -amount
    const nextAccounts = accounts.map(a => (
      a.id === accountId ? { ...a, balance: Number(a.balance || 0) + delta } : a
    ))

    const entry = {
      id: uid(),
      accountId,
      amount,
      direction,
      kind,
      relatedAccountId,
      note: note || '',
      date: todayISO()
    }

    await persistActiveLedger({ ...activeLedger, accounts: nextAccounts, accountTxns: [entry, ...accountTxns] })
    show('Saved.')
  }

  async function transferAccount({ fromId, toId, amount, note }){
    const from = accounts.find(a => a.id === fromId)
    const to = accounts.find(a => a.id === toId)
    if (!from || !to || fromId === toId) return

    const nextAccounts = accounts.map(a => {
      if (a.id === fromId) return { ...a, balance: Number(a.balance || 0) - amount }
      if (a.id === toId) return { ...a, balance: Number(a.balance || 0) + amount }
      return a
    })

    const transferId = uid()
    const base = { kind: 'transfer', note: note || '', date: todayISO() }
    const outEntry = {
      id: transferId + '-out',
      accountId: fromId,
      amount,
      direction: 'out',
      relatedAccountId: toId,
      ...base
    }
    const inEntry = {
      id: transferId + '-in',
      accountId: toId,
      amount,
      direction: 'in',
      relatedAccountId: fromId,
      ...base
    }

    await persistActiveLedger({
      ...activeLedger,
      accounts: nextAccounts,
      accountTxns: [inEntry, outEntry, ...accountTxns]
    })
    show('Transfer saved.')
  }

  async function updateAccountGroups(nextGroups){
    await persistActiveLedger({ ...activeLedger, groups: nextGroups })
  }

  async function updateAccounts(nextAccounts){
    await persistActiveLedger({ ...activeLedger, accounts: nextAccounts })
  }

  // ---------- Export/Import/Reset ----------
  function download(filename, text){
    const blob = new Blob([text], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1200)
  }

  async function handleExport(){
    const enc = exportEncryptedBackup()
    download(`local-finance-backup-encrypted-${new Date().toISOString().slice(0,10)}.json`, enc)
    show('Exported encrypted backup.')
  }

  async function handleImport(file){
    try{
      const text = await file.text()
      importEncryptedBackup(text)
      show('Imported. Unlock with your PIN.')
      setStage('unlock')
              const fresh = normalizeVault(null)
              setVaultState({
                ...fresh,
                settings: { ...fresh.settings, pinLockEnabled: settings.pinLockEnabled }
              })
    } catch(e){
      show(e.message || 'Import failed.')
    }
  }

  async function handleReset(){
    if (!confirm('This will delete everything on this device. Continue?')) return
    await resetAll()
    localStorage.removeItem(SEED_KEY)
    localStorage.setItem(PIN_FLOW_KEY, 'false')
    setPin(''); setPin2('')
    setVaultState(normalizeVault(null))
    setStage('setpin')
    show('Reset complete.')
  }

  async function handleLoadDemo(){
    if (!confirm('Load demo data? This will replace your current data.')) return
    const data = getSeedVault()
    localStorage.setItem(SEED_KEY, '1')
    await persist(data)
    show('Demo data loaded.')
  }

  // ---------- Screens ----------
  function HomeScreen(){
    const monthLabel = useMemo(() => formatMonthLabel(month), [month])
    const expenseTotals = useMemo(() => {
      const map = new Map()
      for (const c of expenseCats) map.set(c, 0)
      for (const t of filteredTxns){
        if (t.type !== 'expense') continue
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
      return map
    }, [filteredTxns, expenseCats])

    const incomeTotals = useMemo(() => {
      const map = new Map()
      for (const c of incomeCats) map.set(c, 0)
      for (const t of filteredTxns){
        if (t.type !== 'income') continue
        const key = t.category || 'Other'
        map.set(key, (map.get(key) || 0) + Number(t.amount || 0))
      }
      return map
    }, [filteredTxns, incomeCats])

    function addCategory(type){
      const name = prompt(`New ${type} category name?`)
      if (!name) return
      const trimmed = name.trim()
      if (!trimmed) return
      const list = type === 'expense' ? expenseCats : incomeCats
      if (list.some(c => c.toLowerCase() === trimmed.toLowerCase())) return
      const next = [trimmed, ...list]
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

    if (selectedCategory){
      return (
        <CategoryDetail
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
          onAdd={(amount, note, accountId, date) =>
            addQuickTxn({
              type: selectedCategory.type,
              amount,
              category: selectedCategory.name,
              note,
              accountId,
              date
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

        <div className="ledgerSection">
          <div className="ledgerSectionHead">
            <div className="ledgerSectionTitle">
              Expenses <span className="ledgerSectionTotal">{fmtTZS(kpis.exp)}</span>
            </div>
            <button className="ledgerAddBtn" onClick={() => addCategory('expense')} type="button">
              + Add
            </button>
          </div>
          <div className="ledgerGrid">
            {expenseCats.map((c, i) => {
              const meta = categoryMeta.expense?.[c] || { budget: 0, subs: [] }
              const spent = expenseTotals.get(c) || 0
              const ratio = meta.budget > 0 ? spent / meta.budget : 0
              const progress = Math.min(ratio * 100, 100)
              const progressColor = ratio >= 1 ? '#e24b4b' : '#2fbf71'
              return (
              <div
                className={`ledgerCard theme-${(i % 9) + 1}`}
                key={c}
                style={{
                  '--progress': `${progress}%`,
                  '--progress-color': progressColor
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
                <div className="ledgerCardIcon">{c.slice(0,1).toUpperCase()}</div>
                <div className="ledgerCardValue">{fmtTZS(expenseTotals.get(c) || 0)}</div>
              </div>
            )})}
          </div>
        </div>

        <div className="ledgerSection">
          <div className="ledgerSectionHead">
            <div className="ledgerSectionTitle">
              Income <span className="ledgerSectionTotal">{fmtTZS(kpis.inc)}</span>
            </div>
            <button className="ledgerAddBtn" onClick={() => addCategory('income')} type="button">
              + Add
            </button>
          </div>
          <div className="ledgerGrid">
            {incomeCats.map((c, i) => (
              <div
                className={`ledgerCard theme-${(i % 6) + 4}`}
                key={c}
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
                <div className="ledgerCardIcon">{c.slice(0,1).toUpperCase()}</div>
                <div className="ledgerCardValue">{fmtTZS(incomeTotals.get(c) || 0)}</div>
              </div>
            ))}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  function CategoryDetail({ category, onClose, onAdd, total, meta, onUpdateMeta }){
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [date, setDate] = useState(todayISO())
    const [accountId, setAccountId] = useState('')
    const [selectedSub, setSelectedSub] = useState('')
    const [selectedTxn, setSelectedTxn] = useState(null)
    const budget = meta?.budget || 0
    const subcats = meta?.subs?.length ? meta.subs : (CATEGORY_SUBS[category.name] || [])

    const spent = total
    const ratio = budget > 0 ? spent / budget : 0
    const pct = budget > 0 ? Math.min(ratio * 100, 999).toFixed(1) : '0.0'
    const left = budget > 0 ? Math.max(budget - spent, 0) : 0
    const over = budget > 0 ? Math.max(spent - budget, 0) : 0

    const recentTxns = useMemo(() => {
      return filteredTxns
        .filter(t => t.category === category.name)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 20)
    }, [filteredTxns, category.name])

    const groupedRecent = useMemo(() => {
      const map = new Map()
      for (const t of recentTxns){
        if (!map.has(t.date)) map.set(t.date, [])
        map.get(t.date).push(t)
      }
      return Array.from(map.entries())
    }, [recentTxns])

    function openTxnDetail(t){
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

    function addSubcategory(){
      const name = prompt('Subcategory name?')
      if (!name) return
      const trimmed = name.trim()
      if (!trimmed) return
      const next = Array.from(new Set([trimmed, ...subcats]))
      onUpdateMeta?.({ budget, subs: next })
    }

    function updateBudget(value){
      const nextBudget = Number(value || 0)
      onUpdateMeta?.({ budget: nextBudget, subs: subcats })
    }

    if (selectedTxn){
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
      <div className="catDetailScreen">
        <div className="catDetailHeader">
          <button className="iconBtn" onClick={onClose} type="button">✕</button>
          <div className="catDetailTitle">{category.name}</div>
          <button className="iconBtn" type="button">☰</button>
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

        <div className="catDetailBudget">
          <label>Monthly budget (TZS)</label>
          <input
            inputMode="decimal"
            value={budget || ''}
            onChange={e => updateBudget(e.target.value)}
            placeholder="e.g. 500000"
          />
        </div>

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
          <div className="field">
            <label>Note (optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Bus fare"
            />
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              const combinedNote = selectedSub
                ? `${selectedSub}${note ? ` • ${note}` : ''}`
                : note
              onAdd(amount, combinedNote, accountId, date)
              setAmount('')
              setNote('')
              setDate(todayISO())
              setAccountId('')
            }}
          >
            Add {category.type === 'expense' ? 'Expense' : 'Income'}
          </button>
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
                    <div>{new Date(date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</div>
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
                          <div className="catHistoryIcon">{category.name.slice(0,1).toUpperCase()}</div>
                          <div className="catHistoryInfo">
                            <div className="catHistoryTitleRow">{t.note || category.name}</div>
                            <div className="catHistoryMeta">{acct ? acct.name : 'No account'}</div>
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
      </div>
    )
  }

  function TransactionsScreen(){
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

      const acctTxns = filteredAccountTxns.map(t => {
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

      return [...baseTxns, ...acctTxns].sort((a,b) => (a.date < b.date ? 1 : -1))
    }, [filteredTxns, filteredAccountTxns, accounts])

    const groupedTxns = useMemo(() => {
      const map = new Map()
      for (const t of combinedTxns){
        if (!map.has(t.date)) map.set(t.date, [])
        map.get(t.date).push(t)
      }
      return Array.from(map.entries())
    }, [combinedTxns])

    if (selectedTxn){
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
            <button className="txGhost" type="button">
              Kapapa Invest ▾
            </button>
          </div>

          <div className="txPeriod">
            <button className="txNavBtn" onClick={() => shiftMonth(-1)} type="button">‹</button>
            <div className="txPeriodLabel">{periodLabel}</div>
            <button className="txNavBtn" onClick={() => shiftMonth(1)} type="button">›</button>
          </div>

          <div className="txActions">
            <button className="txIconBtn" type="button" title="Pick date">📅</button>
            <button className="txIconBtn" type="button" title="Filters">⏳</button>
          </div>
        </div>

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

        <div className="txList">
          {groupedTxns.length === 0 ? (
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
                    <div>{new Date(date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</div>
                    <div className="txDayTotals">
                      {totals.out > 0 && <span className="out">OUT {fmtTZS(totals.out)}</span>}
                      {totals.in > 0 && <span className="in">IN {fmtTZS(totals.in)}</span>}
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
                          {(t.title || 'T').slice(0,1).toUpperCase()}
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
          )}
        </div>

        <div className="txBottomTabs">
          <button className="active" type="button">Record</button>
          <button type="button">Stats</button>
          <button type="button">Tag</button>
        </div>
      </div>
    )
  }

  function TransactionDetail({ txn, accounts, expenseCats, incomeCats, onSave, onClose }){
    const isEditable = txn.kind === 'txn'
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

    function handleSave(){
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
          <button className="pillBtn" type="button" disabled={!isEditable} onClick={handleSave}>
            Save
          </button>
        </div>

        <div className={`txnAmountPill ${type === 'income' ? 'pos' : 'neg'}`}>
          {type === 'income' ? '+' : '-'}{fmtTZS(amount || 0)}
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
      </div>
    )
  }

  function SettingsScreen(){
    return (
      <div className="card">
        <h2>Settings</h2>

        <div className="row">
          <button className="btn" onClick={handleExport}>Export (Encrypted)</button>

          <label className="btn" style={{display:'inline-flex', alignItems:'center', gap:8}}>
            Import
            <input
              type="file"
              accept="application/json"
              style={{display:'none'}}
              onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])}
            />
          </label>

          <button className="btn danger" onClick={handleReset}>Reset</button>
        </div>

        <div className="small" style={{marginTop:10}}>
          Important: iPhone Safari storage can sometimes be cleared if space is low.
          Export backups regularly.
        </div>

        <div className="hr" />

        <div className="row" style={{ alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:600 }}>PIN lock</div>
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

        <div className="small" style={{marginTop:10}}>
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
      </div>
    )
  }

  // ---------- Auth screens ----------
  if (stage === 'loading') return null

  if (stage === 'setpin'){
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
            <input value={pin} onChange={e=>setPin(e.target.value)} placeholder="e.g. 1234" />
          </div>
          <div className="field">
            <label>Confirm PIN</label>
            <input value={pin2} onChange={e=>setPin2(e.target.value)} placeholder="repeat PIN" />
          </div>

          <button className="btn primary" onClick={handleSetPin}>Create Vault</button>

          {toast && <div className="toast">{toast}</div>}
          <div className="small" style={{marginTop:10}}>
            Tip: Use iPhone Face ID/Passcode + a PIN you can remember.
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'unlock'){
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
            <input value={pin} onChange={e=>setPin(e.target.value)} placeholder="Your PIN" />
          </div>
          <div className="row">
            <button className="btn primary" onClick={handleUnlock}>Unlock</button>
            <button className="btn danger" onClick={handleReset}>Reset</button>
          </div>
          {toast && <div className="toast">{toast}</div>}
          <div className="small" style={{marginTop:10}}>
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
        <AccountsScreen
          accounts={accounts}
          accountTxns={accountTxns}
          groups={activeLedger.groups || []}
          onUpsertAccount={upsertAccount}
          onDeleteAccount={deleteAccount}
          onAddAccountTxn={addAccountTxn}
          onTransferAccount={transferAccount}
          onUpdateGroups={updateAccountGroups}
          onUpdateAccounts={updateAccounts}
        />
      )}

      {tab === 'tx' && <TransactionsScreen />}

      {tab === 'settings' && <SettingsScreen />}

      {/* Bottom tabs */}
      <BottomNav tab={tab} setTab={setTab} variant="light" />
    </div>
  )
}
