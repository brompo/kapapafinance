import React, { useEffect } from 'react'
import { AppProvider, useAppContext } from './context/AppContext'
import { GlobalToast } from './components/GlobalToast'
import { HomeScreen } from './screens/HomeScreen'
import { FinanceInsightsScreen } from './screens/FinanceInsightsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import AccountsScreen from './screens/Accounts'
import { FlowScreen } from './screens/FlowScreen'
import BottomNav from './components/BottomNav'

import { LandingStage, PinStage, UnlockStage } from './stages/AuthStages'

function VaultApp() {
  const {
    stage, tab, setTab, selectedCategory, setSelectedCategory, showAddForm,
    accounts, allAccounts, allAccountTxns, txns, clients, groups, categories,
    focusAccountId, settings, setFocusAccountId,
    show, upsertAccount, deleteAccount, mergeAccounts, addAccountTxn, issueLoan,
    transferAccount, payCreditBack, updateAccountTxn,
    deleteAccountTxn, updateAccountGroups, updateAccounts, reallocateBuckets,
    markDueFrom, unmarkDueFrom, settleDueFrom,
    updateSettings
  } = useAppContext()

  const navigateTab = (next) => {
    setSelectedCategory(null)
    setTab(next)
  }

  // Optional tabs (Flow, Kapapa, Insights) fall back to Transactions if their
  // Settings toggle is off while they're the active tab — e.g. turning one
  // off from Settings itself, or a stale tab from before a toggle changed.
  useEffect(() => {
    if (tab === 'flow' && !settings.flowEnabled) setTab('tx')
    else if (tab === 'kapapa' && !settings.kapapaEnabled) setTab('tx')
    else if (tab === 'insights' && !settings.insightsEnabled) setTab('tx')
  }, [tab, settings.flowEnabled, settings.kapapaEnabled, settings.insightsEnabled, setTab])

  if (stage === 'loading') return <div className="loading">Kapapa Finance...</div>
  if (stage === 'landing') return <LandingStage />
  if (stage === 'setpin') return <PinStage mode="set" />
  if (stage === 'setpin2') return <PinStage mode="confirm" />
  if (stage === 'unlock') return <UnlockStage />

  return (
    <div className="appContainer">
      <main className="mainContent">
        {(tab === 'tx' || selectedCategory) && <HomeScreen />}
        {tab === 'flow' && !selectedCategory && settings.flowEnabled && <FlowScreen />}
        {tab === 'kapapa' && !selectedCategory && settings.kapapaEnabled && <FlowScreen />}
        {tab === 'insights' && settings.insightsEnabled && <FinanceInsightsScreen />}
        {tab === 'accounts' && (
          <AccountsScreen
            accounts={accounts}
            allAccounts={allAccounts}
            accountTxns={allAccountTxns}
            txns={txns}
            clients={clients}
            groups={groups}
            categories={categories}
            focusAccountId={focusAccountId}
            settings={settings}
            onUpdateSettings={updateSettings}
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
            onMarkDueFrom={markDueFrom}
            onUnmarkDueFrom={unmarkDueFrom}
            onSettleDueFrom={settleDueFrom}
            onToast={show}
          />
        )}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {!(selectedCategory && showAddForm) && (
        <BottomNav tab={tab} setTab={navigateTab} variant="light" />
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
