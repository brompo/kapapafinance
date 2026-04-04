import { useState, useEffect } from 'react';
import { loadVault, loadVaultPlain, saveVault, saveVaultPlain, importEncryptedBackup, exportEncryptedBackup } from '../cryptoVault.js';
import { normalizeVault } from '../utils/ledger.js';
import { CLOUD_BACKUP_WARN_DAYS_DEFAULT, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, GOOGLE_SCOPES, CLOUD_BACKUP_LATEST_NAME, CLOUD_BACKUP_PREFIX, SEED_KEY } from '../constants.js';

function base64UrlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sha256(data) {
  const encoder = new TextEncoder()
  const msg = encoder.encode(data)
  const hash = await crypto.subtle.digest('SHA-256', msg)
  return hash
}

function randomString(len = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let res = ''
  const vals = new Uint32Array(len)
  crypto.getRandomValues(vals)
  for (let i = 0; i < len; i++) {
    res += charset[vals[i] % charset.length]
  }
  return res
}

function isVaultEmpty(v) {
  if (!v) return true
  if (v.ledgers && v.ledgers.length > 0) return false
  if (v.accounts && v.accounts.length > 0) return false
  return true
}

export function useGoogleDrive({ stage, setStage, settings, updateSettings, vault, persist, show, pin, setPin, setVaultState, setTab, DEFAULT_TAB }) {
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [cloudAccessToken, setCloudAccessToken] = useState('')
  const [cloudAccessExpiry, setCloudAccessExpiry] = useState(0)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [restoreFiles, setRestoreFiles] = useState([])
  const [restorePin, setRestorePin] = useState('')
  const [selectedRestoreId, setSelectedRestoreId] = useState('')

  const cloudBackup = settings?.cloudBackup || {
    enabled: false,
    provider: 'google',
    warnDays: CLOUD_BACKUP_WARN_DAYS_DEFAULT,
    google: { refreshToken: '', lastBackupAt: null, latestFileId: null, lastBackupError: '' }
  }
  const cloudGoogle = cloudBackup.google || {}
  const cloudLastBackup = cloudGoogle.lastBackupAt ? new Date(cloudGoogle.lastBackupAt) : null
  const cloudWarnDays = cloudBackup.warnDays || CLOUD_BACKUP_WARN_DAYS_DEFAULT
  const cloudStale = cloudLastBackup
    ? (Date.now() - cloudLastBackup.getTime()) > cloudWarnDays * 86400000
    : cloudBackup.enabled

  useEffect(() => {
    async function handleAuthRedirect() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const stateParam = params.get('state')
      const err = params.get('error')
      if (!code && !err) return
      if (err) {
        show('Google sign-in cancelled.')
        window.history.replaceState({}, '', window.location.origin + window.location.pathname)
        return
      }
      if (!code) return
      const storedState = sessionStorage.getItem('gdrive_oauth_state')
      const verifier = sessionStorage.getItem('gdrive_oauth_verifier')
      if (!verifier || !storedState || storedState !== stateParam) {
        show('Google sign-in failed.')
        window.history.replaceState({}, '', window.location.origin + window.location.pathname)
        return
      }
      try {
        const token = await exchangeGoogleCode(code, verifier)
        const pending = {
          refreshToken: token.refresh_token || '',
          accessToken: token.access_token || '',
          expiresIn: token.expires_in || 0
        }
        sessionStorage.setItem('gdrive_pending_token', JSON.stringify(pending))
        show('Google Drive connected. Unlock to finish.')
      } catch (e) {
        show('Google sign-in failed.')
      } finally {
        sessionStorage.removeItem('gdrive_oauth_state')
        sessionStorage.removeItem('gdrive_oauth_verifier')
        window.history.replaceState({}, '', window.location.origin + window.location.pathname)
      }
    }
    handleAuthRedirect()
  }, [])

  useEffect(() => {
    const pending = sessionStorage.getItem('gdrive_pending_token')
    if (!pending) return
    if (stage !== 'app') return
    try {
      const data = JSON.parse(pending)
      if (data.refreshToken) {
        const next = {
          ...settings,
          cloudBackup: {
            ...(settings.cloudBackup || {}),
            enabled: true,
            provider: 'google',
            warnDays: settings.cloudBackup?.warnDays || CLOUD_BACKUP_WARN_DAYS_DEFAULT,
            google: {
              ...(settings.cloudBackup?.google || {}),
              refreshToken: data.refreshToken,
              lastBackupAt: settings.cloudBackup?.google?.lastBackupAt || null,
              latestFileId: settings.cloudBackup?.google?.latestFileId || null
            }
          }
        }
        persist({ ...vault, settings: next })
        show('Google Drive connected.')
      }
    } catch { }
    sessionStorage.removeItem('gdrive_pending_token')
  }, [stage, settings, vault, persist, show])

  useEffect(() => {
    if (stage !== 'app') return
    if (!cloudBackup.enabled || !cloudGoogle.refreshToken) return
    let lastAuto = 0
    const minInterval = 5 * 60 * 1000
    const handler = () => {
      const now = Date.now()
      if (now - lastAuto < minInterval) return
      lastAuto = now
      backupNow({ silent: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler()
    }
    window.addEventListener('beforeunload', handler)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', handler)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [stage, cloudBackup.enabled, cloudGoogle.refreshToken])

  async function startGoogleAuth() {
    const verifier = randomString(64)
    const challenge = base64UrlEncode(await sha256(verifier))
    const stateParam = randomString(24)
    sessionStorage.setItem('gdrive_oauth_state', stateParam)
    sessionStorage.setItem('gdrive_oauth_verifier', verifier)
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', GOOGLE_SCOPES)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', stateParam)
    window.location.href = authUrl.toString()
  }

  async function exchangeGoogleCode(code, verifier) {
    const body = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Token exchange failed.')
    return res.json()
  }

  async function refreshGoogleToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) throw new Error('Token refresh failed.')
    return res.json()
  }

  async function getGoogleAccessToken() {
    const cloud = settings.cloudBackup || {}
    const refreshToken = cloud.google?.refreshToken
    if (!refreshToken) throw new Error('Not connected to Google Drive.')
    const now = Date.now()
    if (cloudAccessToken && cloudAccessExpiry && now < cloudAccessExpiry - 30000) {
      return cloudAccessToken
    }
    const token = await refreshGoogleToken(refreshToken)
    const expiresAt = Date.now() + (Number(token.expires_in || 0) * 1000)
    setCloudAccessToken(token.access_token || '')
    setCloudAccessExpiry(expiresAt)
    return token.access_token
  }

  async function driveUploadFile({ content, name, fileId }) {
    const accessToken = await getGoogleAccessToken()
    const boundary = '-------kapapa' + Math.random().toString(16).slice(2)
    const metadata = {
      name,
      parents: ['appDataFolder']
    }
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n')
    const endpoint = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
    const res = await fetch(endpoint, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    })
    if (!res.ok) throw new Error('Upload failed.')
    return res.json()
  }

  async function driveListBackups() {
    const accessToken = await getGoogleAccessToken()
    const q = "name contains 'kapapa-finance-backup' and trashed=false"
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('spaces', 'appDataFolder')
    url.searchParams.set('q', q)
    url.searchParams.set('fields', 'files(id,name,modifiedTime)')
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('List failed.')
    const data = await res.json()
    return Array.isArray(data.files) ? data.files : []
  }

  async function driveDownloadFile(fileId) {
    const accessToken = await getGoogleAccessToken()
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) throw new Error('Download failed.')
    return res.text()
  }

  async function backupNow({ silent = false } = {}) {
    if (!cloudBackup.enabled) {
      if (!silent) show('Cloud backup is disabled.')
      return
    }
    if (!cloudGoogle.refreshToken) {
      if (!silent) show('Connect Google Drive first.')
      return
    }
    if (cloudBusy) return
    setCloudBusy(true)
    setCloudError('')
    try {
      const content = exportEncryptedBackup()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const versionedName = `${CLOUD_BACKUP_PREFIX}${stamp}.json`
      await driveUploadFile({ content, name: versionedName })

      let latestId = cloudGoogle.latestFileId
      if (!latestId) {
        const files = await driveListBackups()
        const found = files.find(f => f.name === CLOUD_BACKUP_LATEST_NAME)
        latestId = found?.id || null
      }
      const latestRes = await driveUploadFile({
        content,
        name: CLOUD_BACKUP_LATEST_NAME,
        fileId: latestId || undefined
      })
      const next = {
        ...settings,
        cloudBackup: {
          ...cloudBackup,
          enabled: true,
          provider: 'google',
          warnDays: cloudWarnDays,
          google: {
            ...cloudGoogle,
            latestFileId: latestRes?.id || latestId || null,
            lastBackupAt: new Date().toISOString(),
            lastBackupError: ''
          }
        }
      }
      updateSettings(next)
      if (!silent) show('Backup complete.')
    } catch (e) {
      setCloudError('Backup failed.')
      const next = {
        ...settings,
        cloudBackup: {
          ...cloudBackup,
          google: {
            ...cloudGoogle,
            lastBackupError: 'Backup failed.'
          }
        }
      }
      updateSettings(next)
      if (!silent) show('Backup failed.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function openRestorePicker() {
    if (!cloudGoogle.refreshToken) {
      show('Connect Google Drive first.')
      return
    }
    setCloudBusy(true)
    setCloudError('')
    try {
      const files = await driveListBackups()
      const sorted = files.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1))
      setRestoreFiles(sorted)
      setSelectedRestoreId(sorted[0]?.id || '')
      setRestorePin('')
      setShowRestoreModal(true)
    } catch (e) {
      setCloudError('Could not load backups.')
      show('Could not load backups.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function restoreFromCloud() {
    if (!selectedRestoreId) return
    if (!restorePin) {
      show('Enter your PIN to restore.')
      return
    }
    setCloudBusy(true)
    setCloudError('')
    try {
      const prevMeta = localStorage.getItem('lf_meta_v1')
      const prevVault = localStorage.getItem('lf_vault_v1')
      const text = await driveDownloadFile(selectedRestoreId)
      importEncryptedBackup(text)
      const data = normalizeVault(await loadVault(restorePin))
      setPin(restorePin)
      setVaultState(data)
      setStage('app')
      setShowRestoreModal(false)
      setRestorePin('')
      show('Restore complete.')
    } catch (e) {
      const prevMeta = localStorage.getItem('lf_meta_v1')
      const prevVault = localStorage.getItem('lf_vault_v1')
      if (typeof prevMeta === 'string') localStorage.setItem('lf_meta_v1', prevMeta)
      if (typeof prevVault === 'string') localStorage.setItem('lf_vault_v1', prevVault)
      show('Restore failed. Check your PIN.')
    } finally {
      setCloudBusy(false)
    }
  }

  return {
    cloudBusy, cloudError, cloudStale, cloudLastBackup, cloudWarnDays,
    cloudBackup, cloudGoogle,
    backupNow, openRestorePicker, restoreFromCloud, startGoogleAuth,
    restoreFiles, setRestoreFiles, selectedRestoreId, setSelectedRestoreId, restorePin, setRestorePin, showRestoreModal, setShowRestoreModal
  }
}
