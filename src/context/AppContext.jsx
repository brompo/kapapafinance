import React, { createContext, useContext, useState, useMemo, useEffect } from 'react'
import {
  uid, createLedger, normalizeLedger, normalizeVault, isVaultEmpty,
  normalizeAccountsWithGroups
} from '../utils/ledger.js'
import { todayISO, monthsBetween, daysBetween, calculateAssetMetrics, monthKey, fmtTZS } from '../money.js'
import {
  SEED_KEY, PIN_FLOW_KEY, DEFAULT_TAB
} from '../constants.js'
import { useVault } from '../hooks/useVault.js'
import { useGoogleDrive } from '../hooks/useGoogleDrive.js'
import { loadVaultPlain, exportEncryptedBackup, importEncryptedBackup, resetAll, hasPin } from '../cryptoVault.js'

const AppContext = createContext()

export function AppProvider({ children }) {
  const [stage, setStage] = useState('loading')
  const [tab, setTab] = useState(DEFAULT_TAB)
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [vault, setVaultState] = useState(() => normalizeVault(null))

  // UI States
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [showAddForm, setShowAddForm] = useState(true)
  const [highlightId, setHighlightId] = useState(null)
  const [focusAccountId, setFocusAccountId] = useState(null)
  const [toast, setToast] = useState('')

  const show = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Wrapper to reset category detail tab to "Adding" when a category is selected
  const handleSelectCategory = (cat) => {
    if (cat) setShowAddForm(true);
    setSelectedCategory(cat);
  }

  // Hook integrations
  const vaultControls = useVault({
    setStage,
    setTab,
    show,
    setSelectedCategory: handleSelectCategory,
    setFocusAccountId,
    isVaultEmpty,
    normalizeVault,
    createLedger,
    vault,
    setVaultState
  })



  // Initialization
  useEffect(() => {
    console.log('AppContext: Starting initialization...')
    async function init() {
      try {
        const isPinned = localStorage.getItem(PIN_FLOW_KEY) === 'true'
        if (isPinned && hasPin()) {
          setStage('unlock')
          return
        }

        const plain = loadVaultPlain()
        if (plain) {
          const v = normalizeVault(plain)
          setVaultState(v)
          setStage('app')
          setTab(v.settings?.defaultAppTab || DEFAULT_TAB)
          return
        }

        console.log('AppContext: Set stage to landing')
        setStage('landing')
      } catch (e) {
        console.error('AppContext: Init failed', e)
        setStage('landing')
      }
    }
    init()
  }, [])

  const {
    handleSetPin,
    handleUnlock,
    handlePinToggle,
    persist,
    persistActiveLedger,
    persistLedgerAndAccounts,
    updateSettings,
    handleAddPersonalLedger,
    handleAddBusinessLedger,
    handleSaveNewLedger,
    handleDeleteLedger,
    handleSelectLedger,
    handleSwitchLedgerToAccounts,
    activeLedger,
    allAccounts,
    allAccountTxns,
    pin, setPin, pin2, setPin2,
    showLedgerPicker, setShowLedgerPicker,
    showAddLedgerModal, setShowAddLedgerModal,
    addLedgerName, setAddLedgerName
  } = vaultControls

  const cloudGoogleControls = useGoogleDrive({
    vault,
    setVaultState,
    show,
    normalizeVault,
    settings: vault.settings || {},
    updateSettings,
    persist,
    setTab,
    DEFAULT_TAB,
    setStage
  })

  function handleReset() {
    if (window.confirm('Wipe all data and reset?')) {
      resetAll()
      setStage('landing')
    }
  }

  // Derived data
  const accounts = useMemo(() => {
    if (!activeLedger?.id) return []
    return allAccounts.filter(a => {
      // Show if account belongs to ledger OR has a sub-account in this ledger
      const isMain = !a.ledgerId || a.ledgerId === activeLedger.id
      const hasSub = a.subAccounts?.some(s => s.ledgerId === activeLedger.id)
      return isMain || hasSub
    })
  }, [allAccounts, activeLedger?.id])

  const accountTxns = useMemo(() => {
    if (!activeLedger?.id) return []
    return allAccountTxns.filter(t => {
      const acct = allAccounts.find(a => a.id === t.accountId)
      if (!acct) return false
      const isMain = !acct.ledgerId || acct.ledgerId === activeLedger.id
      const hasSub = acct.subAccounts?.some(s => s.ledgerId === activeLedger.id)
      return isMain || hasSub
    })
  }, [allAccountTxns, allAccounts, activeLedger?.id])

  const txns = activeLedger?.txns || []
  const filteredTxns = useMemo(() =>
    txns.filter(t => t.date && t.date.startsWith(month)),
    [txns, month]
  )

  const categories = activeLedger?.categories || {}
  const categoryMeta = activeLedger?.categoryMeta || {}
  const expenseCats = categories.expense || []
  const incomeCats = categories.income || []

  // KPIs
  const kpis = useMemo(() => {
    let inc = 0, exp = 0
    if (!activeLedger) return { inc: 0, exp: 0, balance: 0 }

    for (const t of filteredTxns) {
      if (t.type === 'income' && !t.reimbursementOf) inc += Number(t.amount || 0)
      if (t.type === 'expense' || t.type === 'cos' || t.type === 'opps') {
        const reimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
        exp += Number(t.amount || 0) - reimbursed
      }
    }
    // Add realized gains to income KPI
    const assets = accounts.filter(a => {
      const g = activeLedger.groups?.find(g => g.id === a.groupId);
      return g && g.type === 'asset';
    });
    for (const acc of assets) {
      const info = calculateAssetMetrics(acc, allAccountTxns, 'asset');
      if (info && info.realizedGains) {
        const monthsGains = info.realizedGains.filter(g => monthKey(g.date) === month);
        for (const g of monthsGains) {
          inc += g.amount;
        }
      }
    }

    // Calculate monthly flow: Income - (Expenses + CoS + Opps + Allocations)
    let monthlyAlloc = 0;
    for (const t of filteredTxns) {
      if (t.type === 'allocation') monthlyAlloc += Number(t.amount || 0);
    }
    const monthlyBalance = inc - exp - monthlyAlloc;

    const bal = accounts.reduce((s, a) => {
      let val = 0
      if (Array.isArray(a.subAccounts) && a.subAccounts.length > 0) {
        val = a.subAccounts.reduce((ss, sub) => ss + Number(sub.balance || 0), 0)
      } else {
        val = Number(a.balance || 0)
      }
      return s + (a.type === 'credit' ? -val : val)
    }, 0)

    return { inc, exp, balance: bal, monthlyBalance, monthlyAlloc }
  }, [filteredTxns, accounts, allAccountTxns, activeLedger, month])

  function shiftMonth(delta) {
    const d = new Date(month + '-01')
    d.setMonth(d.getMonth() + delta)
    setMonth(d.toISOString().slice(0, 7))
  }

  function formatMonthLabel(m) {
    const d = new Date(m + '-01')
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

  function findAccountByIdOrName(idOrName) {
    if (!idOrName) return null
    return allAccounts.find(a => a.id === idOrName || a.name === idOrName) || null
  }

  const ledgerAccountIds = useMemo(() => new Set(accounts.map(a => a.id)), [accounts])

  async function addQuickTxn({ type, amount, category, note, accountId, toAccountId, date, subAccountId, clientId, recurring, pendingClient, updateDefaultAccount }) {
    const amt = Number(amount || 0)
    if (!amt || amt <= 0) { show('Enter a valid amount.'); return false; }
    if (categoryMeta.requireAccountForTxns && !accountId) { show('Please select an account.'); return false; }

    const isRecurring = recurring && recurring.count > 1;
    const count = isRecurring ? recurring.count : 1;
    const freq = isRecurring ? recurring.freq : 'none';

    const newTxns = [];
    const newAcctTxns = [];
    const baseDate = new Date(date || todayISO());
    let totalDelta = 0;

    for (let i = 0; i < count; i++) {
      const iterId = uid();
      let iterDate = new Date(baseDate.getTime());

      if (i > 0) {
        if (freq === 'daily') iterDate.setDate(iterDate.getDate() + i);
        else if (freq === 'weekly') iterDate.setDate(iterDate.getDate() + (i * 7));
        else if (freq === 'monthly') iterDate.setMonth(iterDate.getMonth() + i);
        else if (freq === 'yearly') iterDate.setFullYear(iterDate.getFullYear() + i);
      }

      const iterDateStr = iterDate.toISOString().slice(0, 10);
      const iterNote = isRecurring
        ? `${note ? note.trim() + ' ' : ''}(${i + 1} of ${count})`
        : (note ? note.trim() : '');

      const t = {
        id: iterId,
        type,
        amount: amt,
        category,
        note: iterNote,
        date: iterDateStr,
        accountId: accountId || '',
        toAccountId: toAccountId || '',
        subAccountId: subAccountId || '',
        clientId: clientId || ''
      };

      newTxns.push(t);
      totalDelta += (t.type === 'income' ? amt : -amt);

      if (t.accountId) {
        const acct = allAccounts.find(a => String(a.id) === String(t.accountId) || a.name === t.accountId);
        if (acct) {
          const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : [];
          const targetSubId = subs.length
            ? (subAccountId && subs.find(s => s.id === subAccountId) ? subAccountId : subs[0]?.id)
            : null;

          const entry = {
            id: `txn-${t.id}`,
            accountId: acct.id,
            subAccountId: targetSubId,
            amount: amt,
            direction: t.type === 'income' ? 'in' : 'out',
            kind: 'txn',
            relatedAccountId: t.toAccountId || null,
            note: t.note || t.category,
            date: t.date,
            clientId: t.clientId || ''
          };
          newAcctTxns.push(entry);
        }
      }

      if (t.toAccountId) {
        const acct = allAccounts.find(a => String(a.id) === String(t.toAccountId) || a.name === t.toAccountId);
        if (acct) {
          const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : [];
          const targetSubId = subs.length
            ? (subAccountId && subs.find(s => s.id === subAccountId) ? subAccountId : subs[0]?.id)
            : null;

          const entry = {
            id: `txn-${t.id}-to`,
            accountId: acct.id,
            subAccountId: targetSubId,
            amount: amt,
            direction: 'in',
            kind: 'txn',
            relatedAccountId: t.accountId || null,
            note: t.note || t.category,
            date: t.date,
            clientId: t.clientId || ''
          };
          newAcctTxns.push(entry);
        }
      }
    }

    let nextAccounts = allAccounts
    let nextAccountTxns = allAccountTxns

    if (newAcctTxns.length > 0) {
      const activeTxnIds = new Set(newAcctTxns.map(e => String(e.accountId)));
      // Update account balances
      nextAccounts = allAccounts.map(a => {
        let delta = 0;
        if (activeTxnIds.has(String(a.id)) || activeTxnIds.has(a.name)) {
          // This account was involved in at least one of the new transactions
          const relatedEntries = newAcctTxns.filter(e => String(e.accountId) === String(a.id) || e.accountName === a.name);
          delta = relatedEntries.reduce((s, e) => s + (e.direction === 'in' ? e.amount : -e.amount), 0);
        }
        if (!delta) return a;

        const subs = Array.isArray(a.subAccounts) ? a.subAccounts : [];
        if (!subs.length) return { ...a, balance: Number(a.balance || 0) + delta };

        // For simplicity, apply to first sub if not specified, otherwise specific sub
        const targetSubId = subAccountId || subs[0]?.id;
        const nextSubs = subs.map(s => (
          s.id === targetSubId ? { ...s, balance: Number(s.balance || 0) + delta } : s
        ));
        return { ...a, subAccounts: nextSubs };
      });

      nextAccountTxns = [...newAcctTxns.reverse(), ...allAccountTxns];
    }

    const nextClients = pendingClient ? [...(vault.clients || []), pendingClient] : undefined;

    let nextMetaData = activeLedger.categoryMeta || {};
    if (updateDefaultAccount && (accountId || toAccountId)) {
      nextMetaData = {
        ...nextMetaData,
        [type]: {
          ...(nextMetaData[type] || {}),
          [category]: {
            ...(nextMetaData[type]?.[category] || {}),
            defaultAccountId: accountId || (nextMetaData[type]?.[category]?.defaultAccountId),
            defaultToAccountId: toAccountId || (nextMetaData[type]?.[category]?.defaultToAccountId)
          }
        }
      };
    }

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: [...newTxns.reverse(), ...txns], categoryMeta: nextMetaData },
      nextAccounts,
      nextAccountTxns,
      nextClients
    })

    if (isRecurring) {
      show(`Saved ${count} recurring transactions.`);
    } else {
      show(`${type === 'income' ? 'Income' : 'Expense'} Added`);
    }
    return newTxns[0];
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
    const txnEntries = []
    nextTxns.forEach(t => {
      if (t.accountId) {
        const acct = findAccountByIdOrName(t.accountId)
        if (acct) {
          const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
          const targetSubId = subs.length ? subs[0]?.id : null
          txnEntries.push({
            id: `txn-${t.id}`,
            accountId: acct.id,
            subAccountId: targetSubId,
            amount: Number(t.amount || 0),
            direction: t.type === 'income' ? 'in' : 'out',
            kind: 'txn',
            relatedAccountId: t.toAccountId || null,
            note: t.note || t.category,
            date: t.date || todayISO(),
            clientId: t.clientId || ''
          })
        }
      }
      if (t.toAccountId) {
        const acct = findAccountByIdOrName(t.toAccountId)
        if (acct) {
          const subs = Array.isArray(acct.subAccounts) ? acct.subAccounts : []
          const targetSubId = subs.length ? subs[0]?.id : null
          txnEntries.push({
            id: `txn-${t.id}-to`,
            accountId: acct.id,
            subAccountId: targetSubId,
            amount: Number(t.amount || 0),
            direction: 'in',
            kind: 'txn',
            relatedAccountId: t.accountId || null,
            note: t.note || t.category,
            date: t.date || todayISO(),
            clientId: t.clientId || ''
          })
        }
      }
    })

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

    if (t.toAccountId) {
      const acct = findAccountByIdOrName(t.toAccountId)
      if (acct) {
        const entryId = `txn-${t.id}-to`
        const entry = allAccountTxns.find(at => at.id === entryId)

        const delta = -Number(t.amount || 0) // Reverse 'in'
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

    let nextAccounts = applyAccountDelta(allAccounts, accountId, subAccountId, amt)
    const entry = {
      id: `txn-${reimbTxn.id}`,
      accountId,
      subAccountId,
      amount: amt,
      direction: 'in',
      kind: 'txn',
      relatedAccountId: null,
      note: reimbTxn.note,
      date: reimbTxn.date,
      clientId: ''
    }
    const nextAccountTxns = [entry, ...allAccountTxns]

    persistLedgerAndAccounts({
      nextLedger: { ...activeLedger, txns: nextTxns },
      nextAccounts,
      nextAccountTxns
    })
    show('Reimbursement saved.')
  }

  async function upsertAccount(acc) {
    const exists = allAccounts.find(a => a.id === acc.id)
    const nextAccounts = exists
      ? allAccounts.map(a => a.id === acc.id ? acc : a)
      : [...allAccounts, acc]

    persistLedgerAndAccounts({ nextAccounts })
    show(exists ? 'Account updated.' : 'Account created.')
  }

  async function deleteAccount(accountId) {
    if (!window.confirm('Are you sure? All transactions for this account will be removed.')) return
    const nextAccounts = allAccounts.filter(a => a.id !== accountId)
    const nextAccountTxns = allAccountTxns.filter(t => t.accountId !== accountId && t.relatedAccountId !== accountId)
    persistLedgerAndAccounts({ nextAccounts, nextAccountTxns })
    show('Account deleted.')
  }
  async function updateAccounts(nextLedgerAccounts) {
    if (!Array.isArray(nextLedgerAccounts)) return
    
    // Merge Strategy: Keep other ledgers, replace current ledger accounts
    const otherLedgerAccounts = allAccounts.filter(a => a.ledgerId && a.ledgerId !== activeLedger.id)
    const nextAccounts = [...otherLedgerAccounts, ...nextLedgerAccounts]
    
    persistLedgerAndAccounts({ nextAccounts })
    show('Accounts reordered.')
  }

  async function addAccountTxn(params) {
    const { accountId, subAccountId, amount, direction, note, receiveDate, kind, unit, quantity, unitPrice } = params
    const amt = Number(amount || 0)
    if (!amt) return show('Enter amount.')

    const entry = {
      id: `txn-${uid()}`,
      accountId,
      subAccountId: subAccountId || null,
      amount: amt,
      direction,
      note: note || (kind === 'purchase' ? `Purchase ${quantity} ${unit}` : 'Adjustment'),
      date: receiveDate || todayISO(),
      kind: kind || 'txn',
      unit,
      quantity,
      unitPrice
    }

    const nextAccounts = applyAccountDelta(allAccounts, accountId, subAccountId, direction === 'in' ? amt : -amt)
    persistLedgerAndAccounts({ nextAccounts, nextAccountTxns: [entry, ...allAccountTxns] })
    show('Transaction added.')
  }

  async function transferAccount(params) {
    const { fromId, toId, amount, note, fromSubAccountId, toSubAccountId, date } = params
    const amt = Number(amount || 0)
    if (!amt) return show('Enter amount.')

    const tid = uid()
    const outEntry = {
      id: `txn-${tid}-out`,
      accountId: fromId,
      subAccountId: fromSubAccountId || null,
      amount: amt,
      direction: 'out',
      note: note || 'Transfer',
      date: date || todayISO(),
      kind: 'txn',
      relatedAccountId: toId
    }
    const inEntry = {
      id: `txn-${tid}-in`,
      accountId: toId,
      subAccountId: toSubAccountId || null,
      amount: amt,
      direction: 'in',
      note: note || 'Transfer',
      date: date || todayISO(),
      kind: 'txn',
      relatedAccountId: fromId
    }

    let nextAccounts = applyAccountDelta(allAccounts, fromId, fromSubAccountId, -amt)
    nextAccounts = applyAccountDelta(nextAccounts, toId, toSubAccountId, amt)

    persistLedgerAndAccounts({ nextAccounts, nextAccountTxns: [outEntry, inEntry, ...allAccountTxns] })
    show('Transfer completed.')
  }

  async function updateAccountTxn(original, next) {
    const oldDelta = original.direction === 'in' ? Number(original.amount || 0) : -Number(original.amount || 0)
    const newDelta = next.direction === 'in' ? Number(next.amount || 0) : -Number(next.amount || 0)
    
    let nextAccounts = applyAccountDelta(allAccounts, original.accountId, original.subAccountId, -oldDelta)
    nextAccounts = applyAccountDelta(nextAccounts, next.accountId, next.subAccountId, newDelta)
    
    const nextAccountTxns = allAccountTxns.map(t => t.id === original.id ? next : t)
    persistLedgerAndAccounts({ nextAccounts, nextAccountTxns })
    show('Updated.')
  }

  async function deleteAccountTxn(txnId) {
    const t = allAccountTxns.find(x => x.id === txnId)
    if (!t) return
    const delta = t.direction === 'in' ? -Number(t.amount || 0) : Number(t.amount || 0)
    const nextAccounts = applyAccountDelta(allAccounts, t.accountId, t.subAccountId, delta)
    const nextAccountTxns = allAccountTxns.filter(x => x.id !== txnId)
    persistLedgerAndAccounts({ nextAccounts, nextAccountTxns })
    show('Deleted.')
  }

  async function updateAccountGroups(nextGroups) {
    await persistActiveLedger({ ...activeLedger, groups: nextGroups })
  }

  const clients = vault.clients || []

  // Context value
  const value = {
    // State
    stage, setStage,
    tab, setTab,
    month, setMonth,
    vault, setVaultState,
    activeLedger,
    accounts, allAccounts,
    accountTxns, allAccountTxns,
    txns, filteredTxns,
    categories, categoryMeta,
    expenseCats, incomeCats,
    kpis,
    clients,
    settings: vault.settings || {},

    // UI State
    selectedCategory, setSelectedCategory: handleSelectCategory,
    showAddForm, setShowAddForm,
    highlightId, setHighlightId,
    focusAccountId, setFocusAccountId,
    toast, show,

    // Controls
    ...vaultControls,
    ...cloudGoogleControls,
    shiftMonth,
    formatMonthLabel,

    // Account Helpers
    upsertAccount,
    deleteAccount,
    addAccountTxn,
    transferAccount,
    updateAccountTxn,
    deleteAccountTxn,

    // Transaction Helpers
    addQuickTxn,
    updateTxn,
    delTxn,
    addReimbursement,
    updateAccountGroups,
    updateAccounts,

    // Persistence
    persist,
    persistActiveLedger,
    persistLedgerAndAccounts,

    // Auth & Security
    pin, setPin, pin2, setPin2,
    handleSetPin, handleUnlock, handleReset,
    handlePinToggle,

    // Ledger Management
    showLedgerPicker, setShowLedgerPicker,
    showAddLedgerModal, setShowAddLedgerModal,
    addLedgerName, setAddLedgerName,
    handleAddPersonalLedger, handleAddBusinessLedger,
    handleSaveNewLedger, handleDeleteLedger,
    handleSelectLedger, handleSwitchLedgerToAccounts
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used within AppProvider')
  return context
}
