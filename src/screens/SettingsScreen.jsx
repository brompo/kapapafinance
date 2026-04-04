import React from 'react'
import { useAppContext } from '../context/AppContext'
import { CHANGELOG } from '../changelog'
import pkg from '../../package.json'

export function SettingsScreen() {
  const { show, vault } = useAppContext()
  const version = pkg.version

  return (
    <div className="settingsScreen" >
      <div className="settingsList" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div className="stgSection" style={{ marginTop: 24 }}>
          <div className="stgSectionTitle">APP SETTINGS</div>
          <div className="stgGroup">
            <button className="stgRow" onClick={() => show('General settings click')}>
              <div className="stgRowIcon" style={{ background: '#f3f4f6', borderRadius: 8 }}>⚙️</div>
              <div className="stgRowBody">
                <div className="stgRowText">General</div>
                <div className="stgRowSub">PIN lock, resets, demo data</div>
              </div>
              <div className="stgChevron">›</div>
            </button>
            <button className="stgRow" onClick={() => show('Finance settings click')}>
              <div className="stgRowIcon" style={{ background: '#fffbeb', borderRadius: 8 }}>💰</div>
              <div className="stgRowBody">
                <div className="stgRowText">Finance</div>
                <div className="stgRowSub">Monthly budgets, manage clients</div>
              </div>
              <div className="stgChevron">›</div>
            </button>
            <button className="stgRow" onClick={() => show('Visibility settings click')}>
              <div className="stgRowIcon" style={{ background: '#fef2f2', borderRadius: 8 }}>👁️</div>
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
            <button className="stgRow" onClick={() => show('Backup & Restore click')}>
              <div className="stgRowIcon" style={{ background: '#eff6ff', borderRadius: 8 }}>💾</div>
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
            <button className="stgRow" onClick={() => show('What\'s New click')}>
              <div className="stgRowIcon" style={{ background: '#fafaf9', borderRadius: 8 }}>📜</div>
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
      </div>
    </div>
  )
}
