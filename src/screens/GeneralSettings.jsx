import React from 'react'
import { useAppContext } from '../context/AppContext'

export default function GeneralSettings({ onClose }) {
  const { settings, updateSettings, handlePinToggle, txns, accounts, handleLoadDemo, show } = useAppContext()

  return (
    <div className="subPageOverlay">
      <div className="subPageHeader">
        <button className="backBtn" onClick={onClose}>←</button>
        <h1 className="subPageTitle">General</h1>
      </div>
      <div className="subPageBody">
        <div className="card" style={{ margin: 0 }}>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
            <div>
              <div style={{ fontWeight: 600 }}>PIN lock</div>
              <div className="small">Require PIN to unlock the app.</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!settings.pinLockEnabled}
                onChange={e => handlePinToggle(e.target.checked)}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div className="hr" />

          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Require Account</div>
              <div className="small">Force selecting an account for transactions.</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!settings.requireAccountForTxns}
                onChange={e => {
                  updateSettings({ ...settings, requireAccountForTxns: e.target.checked })
                  show(e.target.checked ? 'Account required.' : 'Account optional.')
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div className="hr" />

          <div className="row" style={{ padding: '16px 0' }}>
            <button
              className="btn"
              onClick={handleLoadDemo}
              disabled={txns.length > 0 || accounts.length > 0}
              style={{ width: '100%', opacity: (txns.length > 0 || accounts.length > 0) ? 0.5 : 1 }}
            >
              {txns.length > 0 || accounts.length > 0 ? 'Demo Data (Ledger not empty)' : 'Load Demo Data'}
            </button>
          </div>
          <div className="small" style={{ marginTop: 4, textAlign: 'center' }}>
            Demo data will overwrite your current ledger. Only available on empty ledgers.
          </div>
        </div>
      </div>
    </div>
  )
}
