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
            <div className="stgRowIcon">📈</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">DSE Watch</div>
              <div className="stgRowSub">Show DSE stock market tab</div>
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
            <div className="stgRowIcon">🌊</div>
            <div className="stgRowBody" style={{ flex: 1 }}>
              <div className="stgRowText">Money Flow Pipeline</div>
              <div className="stgRowSub">New Transactions screen: Collections → Income → Upkeep → Lifestyle → Growth (personal ledgers only)</div>
            </div>
            <label className="toggle" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={!!settings.moneyPipelineEnabled}
                onChange={e => {
                  updateSettings({ ...settings, moneyPipelineEnabled: e.target.checked })
                  show(e.target.checked ? 'Money Flow Pipeline enabled.' : 'Money Flow Pipeline disabled.')
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
