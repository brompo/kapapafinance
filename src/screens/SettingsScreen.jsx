import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import GeneralSettings from './GeneralSettings'
import FinanceSettings from './FinanceSettings'
import BackupSettings from './BackupSettings'
import VisibilitySettings from './VisibilitySettings'
import ChangelogScreen from './ChangelogScreen'
import pkg from '../../package.json'

export function SettingsScreen() {
  const { show } = useAppContext()
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
