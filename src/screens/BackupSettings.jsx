import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'

export default function BackupRestoreSettings({ onClose }) {
  const { 
    settings, updateSettings, vault, persist, show, 
    handleExport, handleImportLoad, startGoogleAuth, 
    backupNow, openRestorePicker, handleReset, handleWipeAll,
    cloudBusy, cloudError, cloudLastBackup, cloudStale, cloudWarnDays,
    cloudGoogle, cloudBackup
  } = useAppContext()

  return (
    <div className="subPageOverlay">
      <div className="subPageHeader">
        <button className="backBtn" onClick={onClose}>←</button>
        <h1 className="subPageTitle">Backup & Restore</h1>
      </div>
      <div className="subPageBody">
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn" style={{ flex: 1 }} onClick={handleExport}>Export JSON</button>
            <label className="btn" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              Import JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleImportLoad(file)
              }} />
            </label>
          </div>

          <div className="hr" />

          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Cloud Backup (Google Drive)</div>
              <div className="small">Encrypted backup stored in your Drive app folder.</div>
              {cloudLastBackup && <div className="small">Last backup: {cloudLastBackup.toLocaleString()}</div>}
              {cloudStale && <div className="small" style={{ color: '#d97706' }}>Not backed up in {cloudWarnDays} days.</div>}
              {cloudError && <div className="small" style={{ color: '#dc2626' }}>{cloudError}</div>}
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!cloudBackup.enabled}
                onChange={e => {
                  const enabled = e.target.checked
                  if (enabled && !cloudGoogle.refreshToken) {
                    startGoogleAuth()
                    return
                  }
                  updateSettings({ ...settings, cloudBackup: { ...cloudBackup, enabled } })
                }}
              />
              <span className="toggleTrack" />
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {!cloudGoogle.refreshToken ? (
              <button className="btn" onClick={startGoogleAuth} disabled={cloudBusy}>Connect Drive</button>
            ) : (
              <button className="btn" onClick={() => {
                updateSettings({ ...settings, cloudBackup: { ...cloudBackup, enabled: false, google: { ...cloudGoogle, refreshToken: '', latestFileId: null } } })
                show('Disconnected.')
              }} disabled={cloudBusy}>Disconnect</button>
            )}
            <button className="btn" onClick={() => backupNow()} disabled={!cloudBackup.enabled || cloudBusy}>
              {cloudBusy ? 'Backing up…' : 'Backup Now'}
            </button>
            <button className="btn" onClick={openRestorePicker} disabled={cloudBusy || !cloudGoogle.refreshToken}>Restore</button>
          </div>

          <div className="hr" style={{ marginTop: 24, marginBottom: 24 }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn danger" onClick={handleReset}>Reset Ledger (Empty)</button>
            <button className="btn danger" onClick={handleWipeAll} style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fee2e2' }}>Wipe All App Data</button>
          </div>
        </div>
      </div>
    </div>
  )
}
