// Local-only encrypted vault using WebCrypto (AES-GCM) and PBKDF2.
// Practical privacy layer (local-only). No server.

const LS_META = 'lf_meta_v1'
const LS_VAULT = 'lf_vault_v1'
const LS_VAULT_PLAIN = 'lf_vault_plain_v1'

function b64encode(buf){
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function b64decode(str){
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function getMeta(){
  try { return JSON.parse(localStorage.getItem(LS_META) || 'null') } catch { return null }
}
function setMeta(meta){
  localStorage.setItem(LS_META, JSON.stringify(meta))
}
function getVaultRaw(){
  try { return JSON.parse(localStorage.getItem(LS_VAULT) || 'null') } catch { return null }
}
function setVaultRaw(v){
  localStorage.setItem(LS_VAULT, JSON.stringify(v))
}
function getVaultPlainRaw(){
  try { return JSON.parse(localStorage.getItem(LS_VAULT_PLAIN) || 'null') } catch { return null }
}
function setVaultPlainRaw(v){
  localStorage.setItem(LS_VAULT_PLAIN, JSON.stringify(v))
}

async function deriveKey(pin, saltB64, iterations){
  const enc = new TextEncoder()
  const salt = new Uint8Array(b64decode(saltB64))
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function hasPin(){
  const meta = getMeta()
  return !!(meta && meta.saltB64 && meta.verifierB64)
}

export async function setNewPin(pin){
  if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 characters.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 200_000

  const enc = new TextEncoder()
  const verifier = await crypto.subtle.digest('SHA-256', new Uint8Array([
    ...enc.encode(pin),
    ...salt
  ]))

  setMeta({
    saltB64: b64encode(salt),
    verifierB64: b64encode(verifier),
    iterations
  })

  // initialize empty vault object
  await saveVault(pin, { txns: [], accounts: [] })
}

export async function loadVault(pin){
  const meta = getMeta()
  if (!meta) throw new Error('No PIN set.')
  const key = await deriveKey(pin, meta.saltB64, meta.iterations || 200_000)

  const raw = getVaultRaw()
  if (!raw) return { txns: [], accounts: [] }

  const iv = new Uint8Array(b64decode(raw.ivB64))
  const ciphertext = b64decode(raw.ctB64)

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  const text = new TextDecoder().decode(plainBuf)
  const data = JSON.parse(text)

  // support older array vaults
  if (Array.isArray(data)) return { txns: data, accounts: [] }

  return {
    txns: Array.isArray(data?.txns) ? data.txns : [],
    accounts: Array.isArray(data?.accounts) ? data.accounts : []
  }
}

export async function saveVault(pin, payload){
  const meta = getMeta()
  if (!meta) throw new Error('No PIN set.')
  const key = await deriveKey(pin, meta.saltB64, meta.iterations || 200_000)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plainText = JSON.stringify(payload)
  const plainBuf = new TextEncoder().encode(plainText)

  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBuf
  )

  setVaultRaw({ ivB64: b64encode(iv), ctB64: b64encode(ctBuf) })
}

export function loadVaultPlain(){
  const raw = getVaultPlainRaw()
  return raw || { txns: [], accounts: [], accountTxns: [] }
}

export function saveVaultPlain(payload){
  setVaultPlainRaw(payload)
}

export function resetPlainVault(){
  localStorage.removeItem(LS_VAULT_PLAIN)
}

export function exportEncryptedBackup(){
  const meta = localStorage.getItem(LS_META)
  const vault = localStorage.getItem(LS_VAULT)
  return JSON.stringify(
    { meta: meta ? JSON.parse(meta) : null, vault: vault ? JSON.parse(vault) : null },
    null,
    2
  )
}

export function importEncryptedBackup(jsonText){
  const obj = JSON.parse(jsonText)
  if (!obj || typeof obj !== 'object') throw new Error('Invalid backup file.')
  if (!obj.meta || !obj.vault) throw new Error('Backup missing meta or vault.')
  localStorage.setItem(LS_META, JSON.stringify(obj.meta))
  localStorage.setItem(LS_VAULT, JSON.stringify(obj.vault))
}

export async function resetAll(){
  localStorage.removeItem(LS_META)
  localStorage.removeItem(LS_VAULT)
  localStorage.removeItem(LS_VAULT_PLAIN)
}
