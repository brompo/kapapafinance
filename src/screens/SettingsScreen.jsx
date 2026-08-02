import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import GeneralSettings from './GeneralSettings'
import FinanceSettings from './FinanceSettings'
import BackupSettings from './BackupSettings'
import VisibilitySettings from './VisibilitySettings'
import ChangelogScreen from './ChangelogScreen'
import pkg from '../../package.json'

export function SettingsScreen() {
  const { settings, updateSettings, show } = useAppContext()
  const version = pkg.version

  const [activeSub, setActiveSub] = useState(null)
  const [forcingUpdate, setForcingUpdate] = useState(false)

  // Nuclear-option updater for when the background auto-updater (main.jsx)
  // hasn't kicked in yet — unregisters the service worker and clears the
  // Cache Storage it populated, then reloads with a cache-busting query
  // param so even a misconfigured host's HTTP cache can't serve stale HTML.
  // Only touches Cache Storage/SW, never localStorage/IndexedDB, so vault
  // data is untouched.
  const forceUpdate = async () => {
    if (forcingUpdate) return
    setForcingUpdate(true)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(reg => reg.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch (err) {
      console.error('Force update failed', err)
    }
    window.location.href = `${window.location.pathname}?_fu=${Date.now()}`
  }

  return (
    <div className="settingsScreen">
      <div className="stgSection" style={{ marginTop: 20 }}>
        <div className="stgSectionTitle">APP SETTINGS</div>
        <div className="stgGroup">
          <button className="stgRow" onClick={() => setActiveSub('general')}>
            <div className="stgRowIcon">⚙️</div>
            <div className="stgRowBody">
              <div className="stgRowText">General</div>
              <div className="stgRowSub">PIN lock, resets, demo data</div>
            </div>
            <div className="stgChevron">›</div>
          </button>
          <button className="stgRow" onClick={() => setActiveSub('finance')}>
            <div className="stgRowIcon">💰</div>
            <div className="stgRowBody">
              <div className="stgRowText">Finance</div>
              <div className="stgRowSub">Monthly budgets, manage clients</div>
            </div>
            <div className="stgChevron">›</div>
          </button>
          <button className="stgRow" onClick={() => setActiveSub('visibility')}>
            <div className="stgRowIcon">👁️</div>
            <div className="stgRowBody">
              <div className="stgRowText">Visibility</div>
              <div className="stgRowSub">Tab order, default start tab</div>
            </div>
            <div className="stgChevron">›</div>
          </button>
        </div>
      </div>

      <div className="stgSection">
        <div className="stgSectionTitle">FEATURES</div>
        <div className="stgGroup">
          <div className="stgRow" style={{ cursor: 'default' }}>
            <div className="stgRowIcon">📊</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">Insights</div>
              <div className="stgRowSub">Show the Insights tab</div>
            </div>
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={settings.insightsEnabled !== false}
                onChange={e => {
                  updateSettings({ ...settings, insightsEnabled: e.target.checked })
                  show(e.target.checked ? 'Insights enabled.' : 'Insights hidden.')
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div className="hr" />

          <div className="stgRow" style={{ cursor: 'default' }}>
            <div className="stgRowIcon">📈</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">DSE Watch</div>
              <div className="stgRowSub">Show DSE stock market view inside the Kapapa tab</div>
            </div>
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={!!settings.dseEnabled}
                onChange={e => {
                  updateSettings({ ...settings, dseEnabled: e.target.checked })
                  show(e.target.checked ? 'DSE Watch enabled.' : 'DSE Watch hidden.')
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div className="hr" />

          <div className="stgRow" style={{ cursor: 'default' }}>
            <div className="stgRowIcon">👨‍👩‍👧‍👦</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">Family</div>
              <div className="stgRowSub">Adds a Family tab for family expenditure, with its own budget cascade (Upkeep/Lifestyle/Growth)</div>
            </div>
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={!!settings.flowEnabled}
                onChange={e => {
                  updateSettings({ ...settings, flowEnabled: e.target.checked })
                  show(e.target.checked ? 'Family enabled.' : 'Family disabled.')
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div className="hr" />

          <div className="stgRow" style={{ cursor: 'default' }}>
            <div className="stgRowIcon">🤝</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">Kapapa</div>
              <div className="stgRowSub">Adds a Kapapa tab for shared/community expenditure, with its own budget cascade</div>
            </div>
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={!!settings.kapapaEnabled}
                onChange={e => {
                  updateSettings({ ...settings, kapapaEnabled: e.target.checked })
                  show(e.target.checked ? 'Kapapa enabled.' : 'Kapapa disabled.')
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>
        </div>
      </div>

      <div className="stgSection">
        <div className="stgSectionTitle">DATA</div>
        <div className="stgGroup">
          <button className="stgRow" onClick={() => setActiveSub('backup')}>
            <div className="stgRowIcon">💾</div>
            <div className="stgRowBody">
              <div className="stgRowText">Backup & Restore</div>
              <div className="stgRowSub">Cloud sync, export/import</div>
            </div>
            <div className="stgChevron">›</div>
          </button>
        </div>
      </div>

      <div className="stgSection">
        <div className="stgSectionTitle">ABOUT</div>
        <div className="stgGroup">
          <button className="stgRow" onClick={() => setActiveSub('changelog')}>
            <div className="stgRowIcon">📜</div>
            <div className="stgRowBody">
              <div className="stgRowText">What's New</div>
              <div className="stgRowSub">Version {version}</div>
            </div>
            <div className="stgChevron">›</div>
          </button>

          <div className="hr" />

          <button className="stgRow" onClick={forceUpdate} disabled={forcingUpdate}>
            <div className="stgRowIcon">🔄</div>
            <div className="stgRowBody">
              <div className="stgRowText">{forcingUpdate ? 'Updating…' : 'Force Update'}</div>
              <div className="stgRowSub">Clear the cached app and reload the latest version. Your data isn't affected.</div>
            </div>
            <div className="stgChevron">›</div>
          </button>
        </div>
      </div>

      <div className="stgFooter">
        Kapapa Finance • v{version}
      </div>

      {activeSub === 'general' && <GeneralSettings onClose={() => setActiveSub(null)} />}
      {activeSub === 'finance' && <FinanceSettings onClose={() => setActiveSub(null)} />}
      {activeSub === 'visibility' && <VisibilitySettings onClose={() => setActiveSub(null)} />}
      {activeSub === 'backup' && <BackupSettings onClose={() => setActiveSub(null)} />}
      {activeSub === 'changelog' && <ChangelogScreen onClose={() => setActiveSub(null)} />}
    </div>
  )
}
