import { useState } from 'react';
import { loadVault, loadVaultPlain, saveVault, saveVaultPlain, hasPin, setNewPin } from '../cryptoVault.js';
import { PIN_FLOW_KEY, SEED_KEY } from '../constants.js';
import { resolveDefaultTab, BOOK_IDS } from '../utils/ledger.js';

export function useVault({
  setStage,
  setTab,
  show,
  setSelectedCategory,
  isVaultEmpty,
  normalizeVault,
  vault,
  setVaultState
}) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');

  const settings = vault.settings || { pinLockEnabled: false };
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
      setTab(resolveDefaultTab(nextVault))
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
      setTab(resolveDefaultTab(data))
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
      setTab(resolveDefaultTab(data))
      show('Unlocked.')
    } catch (e) {
      show('Wrong PIN or vault corrupted.')
    }
  }

  async function persist(nextVault) {
    if (!nextVault) return

    // Safety Lock: Prevent overwriting a populated vault with an empty one
    const hasTxns = (v) => BOOK_IDS.some(id => v?.[id]?.txns?.length > 0)
    const currentHasData = (vault?.accounts?.length > 0 || hasTxns(vault))
    const nextIsEmpty = (!nextVault?.accounts?.length && !hasTxns(nextVault))

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

  function persistBook(bookId, nextBook, nextClients) {
    const vaultUpdate = { ...vault, [bookId]: nextBook }
    if (nextClients) vaultUpdate.clients = nextClients
    return persist(vaultUpdate)
  }

  function persistBookAndAccounts({ bookId, nextBook, nextAccounts, nextAccountTxns, nextClients }) {
    const vaultUpdate = {
      ...vault,
      accounts: nextAccounts ?? allAccounts,
      accountTxns: nextAccountTxns ?? allAccountTxns
    }
    if (nextBook) vaultUpdate[bookId] = nextBook
    if (nextClients) vaultUpdate.clients = nextClients
    return persist(vaultUpdate)
  }

  return {
    pin, setPin,
    pin2, setPin2,

    handlePinToggle,
    handleSetPin,
    handleUnlock,
    persist,
    updateSettings,
    persistBook,
    persistBookAndAccounts,

    allAccounts,
    allAccountTxns
  }
}
