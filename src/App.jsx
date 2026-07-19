import React, { useEffect } from 'react'
import { AppProvider, useAppContext } from './context/AppContext'
import { GlobalToast } from './components/GlobalToast'
import { HomeScreen } from './screens/HomeScreen'
import { FinanceInsightsScreen } from './screens/FinanceInsightsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import AccountsScreen from './screens/Accounts'
import DSEWatchScreen from './screens/DSEWatchScreen'
import { FlowScreen } from './screens/FlowScreen'
import BottomNav from './components/BottomNav'
import { LedgerPicker } from './components/LedgerPicker'

import { LandingStage, PinStage, UnlockStage } from './stages/AuthStages'

function VaultApp() {
  const { 
    stage, tab, setTab, selectedCategory, showAddForm,
    activeLedger, accounts, allAccounts, allAccountTxns, txns, clients,
    ledgers, focusAccountId, settings, setFocusAccountId,
    show, upsertAccount, deleteAccount, mergeAccounts, addAccountTxn, issueLoan,
    transferAccount, payCreditBack, updateAccountTxn, updateAccountTxnMeta,
    deleteAccountTxn, updateAccountGroups, updateAccounts, reallocateBuckets,
    updateSettings, handleSwitchLedgerToAccounts, setShowLedgerPicker,
    showLedgerPicker, handleSelectLedger, handleAddPersonalLedger, handleAddBusinessLedger,
    handleSaveNewLedger, showAddLedgerModal, setShowAddLedgerModal, addLedgerName, setAddLedgerName
  } = useAppContext()

  // Flow tab is only visible for personal ledgers with the setting on — if the
  // user switches ledgers (or the setting) while on it, fall back to Transactions
  // rather than leaving the tab bar pointed at a screen that's no longer rendered.
  useEffect(() => {
    if (tab === 'flow' && !(activeLedger.type === 'personal' && settings.moneyPipelineEnabled)) {
      setTab('tx')
    }
  }, [tab, activeLedger.type, settings.moneyPipelineEnabled, setTab])

  if (stage === 'loading') return <div className="loading">Kapapa Finance...</div>
  if (stage === 'landing') return <LandingStage />
  if (stage === 'setpin') return <PinStage mode="set" />
  if (stage === 'setpin2') return <PinStage mode="confirm" />
  if (stage === 'unlock') return <UnlockStage />

  return (
    <div className="appContainer">
      <main className="mainContent">
        {tab === 'tx' && <HomeScreen />}
        {tab === 'flow' && activeLedger.type === 'personal' && settings.moneyPipelineEnabled && <FlowScreen />}
        {tab === 'insights' && <FinanceInsightsScreen />}
        {tab === 'accounts' && (
          <AccountsScreen
            activeLedgerName={activeLedger.name || 'Personal'}
            onOpenLedgerPicker={() => setShowLedgerPicker(true)}
            accounts={accounts}
            allAccounts={allAccounts}
            accountTxns={allAccountTxns}
            txns={txns}
            clients={clients}
            groups={activeLedger.groups || []}
            categories={activeLedger.categories}
            activeLedgerId={activeLedger.id}
            ledgers={ledgers}
            focusAccountId={focusAccountId}
            settings={settings}
            onUpdateSettings={updateSettings}
            onUpdateAccountTxnMeta={updateAccountTxnMeta}
            onDeleteAccountTxn={deleteAccountTxn}
            onUpdateGroups={updateAccountGroups}
            onUpdateAccounts={updateAccounts}
            onUpsertAccount={upsertAccount}
            onDeleteAccount={deleteAccount}
            onMergeAccounts={mergeAccounts}
            onAddAccountTxn={addAccountTxn}
            onIssueLoan={issueLoan}
            onTransferAccount={transferAccount}
            onPayCreditBack={payCreditBack}
            onReallocateBuckets={reallocateBuckets}
            onUpdateAccountTxn={updateAccountTxn}
            onToast={show}
            onSwitchLedger={handleSwitchLedgerToAccounts}
          />
        )}
        {tab === 'dse' && settings.dseEnabled && <DSEWatchScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      
      {showLedgerPicker && (
        <LedgerPicker
          showLedgerPicker={showLedgerPicker}
          setShowLedgerPicker={setShowLedgerPicker}
          ledgers={ledgers}
          activeLedger={activeLedger}
          handleSelectLedger={handleSelectLedger}
          handleAddPersonalLedger={handleAddPersonalLedger}
          handleAddBusinessLedger={handleAddBusinessLedger}
        />
      )}

      {showAddLedgerModal && (
        <div className="modalBackdrop" onClick={() => setShowAddLedgerModal(null)}>
           <div className="modalCard" onClick={e => e.stopPropagation()}>
              <div className="modalTitle">New {showAddLedgerModal === 'business' ? 'Business' : 'Personal'} Ledger</div>
              <input 
                className="input" 
                autoFocus 
                placeholder="Ledger Name" 
                value={addLedgerName} 
                onChange={e => setAddLedgerName(e.target.value)} 
              />
              <div className="modalFooter" style={{ marginTop: 20 }}>
                <button className="btn" onClick={() => setShowAddLedgerModal(null)}>Cancel</button>
                <button className="btn primary" onClick={handleSaveNewLedger}>Create Ledger</button>
              </div>
           </div>
        </div>
      )}

      {!(selectedCategory && showAddForm) && (
        <BottomNav tab={tab} setTab={setTab} variant="light" />
      )}
      <GlobalToast />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <VaultApp />
    </AppProvider>
  )
}
