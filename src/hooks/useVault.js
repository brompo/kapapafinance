import { useState } from 'react';
import { loadVault, loadVaultPlain, saveVault, saveVaultPlain, hasPin, setNewPin } from '../cryptoVault.js';
import { PIN_FLOW_KEY, SEED_KEY, DEFAULT_TAB } from '../constants.js';

// We need to pass createLedger and normalizeVault because they are defined in App.jsx currently
// Typically these would be extracted into utils/ledger.js as well.
export function useVault({ 
  setStage, 
  setTab, 
  show, 
  setSelectedCategory, 
  setFocusAccountId,
  isVaultEmpty,
  normalizeVault,
  createLedger,
  vault,
  setVaultState
}) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [showLedgerPicker, setShowLedgerPicker] = useState(false);
  const [showAddLedgerModal, setShowAddLedgerModal] = useState(null);
  const [addLedgerName, setAddLedgerName] = useState('');

  const settings = vault.settings || { pinLockEnabled: false };
  const ledgers = vault.ledgers || [];
  const activeLedgerId = vault.activeLedgerId;
  const activeLedger = ledgers.filter(Boolean).find(l => l.id === activeLedgerId) || ledgers[0] || createLedger();
  const allAccounts = vault.accounts || [];
  const allAccountTxns = vault.accountTxns || [];

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
      setTab(nextVault.settings?.defaultAppTab || DEFAULT_TAB)
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
      setTab(data.settings?.defaultAppTab || DEFAULT_TAB)
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
      setTab(data.settings?.defaultAppTab || DEFAULT_TAB)
      show('Unlocked.')
    } catch (e) {
      show('Wrong PIN or vault corrupted.')
    }
  }

  async function persist(nextVault) {
    if (!nextVault) return

    // Safety Lock: Prevent overwriting a populated vault with an empty one
    const currentHasData = (vault?.accounts?.length > 0 || vault?.ledgers?.some(l => l?.txns?.length > 0))
    const nextIsEmpty = (!nextVault?.accounts?.length && !nextVault?.ledgers?.some(l => l?.txns?.length > 0))
    
    if (currentHasData && nextIsEmpty) {
      console.error('CRITICAL: Attempted to save an empty vault over an existing one. BLOCKED.', { current: vault, next: nextVault })
      show('Data Safety: Save Blocked (Empty state detected)')
      return
    }

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

  function persistActiveLedger(nextLedger, nextClients) {
    const hasActive = ledgers.some(l => l.id === activeLedger.id)
    const nextLedgers = hasActive
      ? ledgers.map(l => (l.id === activeLedger.id ? nextLedger : l))
      : [...ledgers, nextLedger]
    const nextActiveId = hasActive ? activeLedger.id : nextLedger.id
    const vaultUpdate = { ...vault, ledgers: nextLedgers, activeLedgerId: nextActiveId }
    if (nextClients) vaultUpdate.clients = nextClients
    persist(vaultUpdate)
  }

  function persistLedgerAndAccounts({ nextLedger, nextAccounts, nextAccountTxns, nextClients }) {
    const targetLedger = nextLedger || activeLedger
    const hasActive = ledgers.some(l => l && l.id === activeLedger.id)
    const nextLedgers = hasActive
      ? ledgers.map(l => (l && l.id === activeLedger.id ? targetLedger : l))
      : [...ledgers, targetLedger]
    
    // Ensure we don't accidentally insert undefined into ledgers
    const cleanLedgers = nextLedgers.filter(l => !!l)
    
    const nextActiveId = hasActive ? activeLedger.id : (targetLedger?.id || activeLedger.id)
    const vaultUpdate = {
      ...vault,
      ledgers: cleanLedgers,
      activeLedgerId: nextActiveId,
      accounts: nextAccounts ?? allAccounts,
      accountTxns: nextAccountTxns ?? allAccountTxns
    }
    if (nextClients) vaultUpdate.clients = nextClients
    persist(vaultUpdate)
  }

  function handleAddPersonalLedger() {
    setAddLedgerName('')
    setShowAddLedgerModal('personal')
    setShowLedgerPicker(false)
  }

  function handleAddBusinessLedger() {
    setAddLedgerName('')
    setShowAddLedgerModal('business')
    setShowLedgerPicker(false)
  }

  function handleSaveNewLedger() {
    const trimmed = addLedgerName.trim()
    if (!trimmed) {
      show('Please enter a ledger name.')
      return
    }
    const type = showAddLedgerModal
    const nextLedger = createLedger({ name: trimmed, type })
    persist({
      ...vault,
      ledgers: [...ledgers, nextLedger],
      activeLedgerId: nextLedger.id
    })
    setShowAddLedgerModal(null)
    setAddLedgerName('')
  }

  function handleDeleteLedger(ledgerId) {
    if (ledgers.length <= 1) {
      show('Cannot delete the only ledger.')
      return
    }
    const ledger = ledgers.find(l => l.id === ledgerId)
    if (!ledger) return
    if (!window.confirm(`Are you sure you want to delete the ledger "${ledger.name}"? This will delete all transactions and accounts within it.`)) return

    const nextLedgers = ledgers.filter(l => l.id !== ledgerId)
    const nextActiveLedgerId = activeLedgerId === ledgerId ? nextLedgers[0].id : activeLedgerId

    // Also remove associated accounts and their transactions
    const accountsToRemove = new Set(allAccounts.filter(a => a.ledgerId === ledgerId).map(a => a.id))
    const nextAccounts = allAccounts.filter(a => a.ledgerId !== ledgerId)
    const nextAccountTxns = allAccountTxns.filter(t => !accountsToRemove.has(t.accountId) && !accountsToRemove.has(t.relatedAccountId))

    persist({
      ...vault,
      ledgers: nextLedgers,
      activeLedgerId: nextActiveLedgerId,
      accounts: nextAccounts,
      accountTxns: nextAccountTxns
    })
    if (activeLedgerId === ledgerId) setShowLedgerPicker(false)
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

  return {
    pin, setPin,
    pin2, setPin2,
    showLedgerPicker, setShowLedgerPicker,
    showAddLedgerModal, setShowAddLedgerModal,
    addLedgerName, setAddLedgerName,
    
    handlePinToggle,
    handleSetPin,
    handleUnlock,
    persist,
    updateSettings,
    persistActiveLedger,
    persistLedgerAndAccounts,
    
    handleAddPersonalLedger,
    handleAddBusinessLedger,
    handleSaveNewLedger,
    handleDeleteLedger,
    handleSelectLedger,
    handleSwitchLedgerToAccounts,
    
    activeLedger,
    ledgers,
    allAccounts,
    allAccountTxns
  }
}
