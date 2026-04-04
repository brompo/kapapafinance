import fs from 'fs';

const appPath = './src/App.jsx';
let code = fs.readFileSync(appPath, 'utf8');

// 1. Add Hook Imports
if (!code.includes('useGoogleDrive')) {
  code = code.replace(
    "import AccountsScreen from './screens/Accounts.jsx'",
    "import AccountsScreen from './screens/Accounts.jsx'\nimport { useGoogleDrive } from './hooks/useGoogleDrive.js'\nimport { useVault } from './hooks/useVault.js'"
  );
}

// 2. Erase global util functions
code = code.replace(/function base64UrlEncode[\s\S]*?\n\}\n\n/, '');
code = code.replace(/async function sha256[\s\S]*?\n\}\n\n/, '');
code = code.replace(/function randomString[\s\S]*?\n\}\n\n/, '');

// 3. Delete old Google Drive Logic blocks
const gDriveAuthStart = code.indexOf('  useEffect(() => {\n    async function handleAuthRedirect()');
const gDriveDriveListEndStr = "  async function driveDownloadFile(fileId) {\n    const accessToken = await getGoogleAccessToken()\n    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`\n    const res = await fetch(url, {\n      headers: { Authorization: `Bearer ${accessToken}` }\n    })\n    if (!res.ok) throw new Error('Download failed.')\n    return res.text()\n  }\n";
const gDriveDriveListEnd = code.indexOf(gDriveDriveListEndStr) + gDriveDriveListEndStr.length;

if (gDriveAuthStart !== -1 && gDriveDriveListEnd !== -1 && gDriveAuthStart < gDriveDriveListEnd) {
    code = code.slice(0, gDriveAuthStart) + code.slice(gDriveDriveListEnd);
}

const restoreBackupStart = code.indexOf('  async function backupNow({ silent = false } = {}) {');
const restoreBackupEndStr = "  useEffect(() => {\n    if (stage !== 'app') return\n    if (!cloudBackup.enabled || !cloudGoogle.refreshToken) return\n    let lastAuto = 0\n    const minInterval = 5 * 60 * 1000\n    const handler = () => {\n      const now = Date.now()\n      if (now - lastAuto < minInterval) return\n      lastAuto = now\n      backupNow({ silent: true })\n    }\n    const onVisibility = () => {\n      if (document.visibilityState === 'hidden') handler()\n    }\n    window.addEventListener('beforeunload', handler)\n    document.addEventListener('visibilitychange', onVisibility)\n    return () => {\n      window.removeEventListener('beforeunload', handler)\n      document.removeEventListener('visibilitychange', onVisibility)\n    }\n  }, [stage, cloudBackup.enabled, cloudGoogle.refreshToken])\n";
const restoreBackupEnd = code.indexOf(restoreBackupEndStr) + restoreBackupEndStr.length;

if (restoreBackupStart !== -1 && restoreBackupEnd !== -1 && restoreBackupStart < restoreBackupEnd) {
    code = code.slice(0, restoreBackupStart) + code.slice(restoreBackupEnd);
}

// 4. Delete old Vault Logic blocks
const handlePinToggleStart = code.indexOf('  async function handlePinToggle(nextEnabled) {');
const handleSwitchLedgerEndStr = "  async function handleSwitchLedgerToAccounts(id, accountId) {\n    if (!id || id === activeLedger.id) return\n    await persist({ ...vault, activeLedgerId: id })\n    setTab('accounts')\n    setFocusAccountId(accountId || null)\n  }\n";
const handleSwitchLedgerEnd = code.indexOf(handleSwitchLedgerEndStr) + handleSwitchLedgerEndStr.length;

if (handlePinToggleStart !== -1 && handleSwitchLedgerEnd !== -1 && handlePinToggleStart < handleSwitchLedgerEnd) {
    code = code.slice(0, handlePinToggleStart) + code.slice(handleSwitchLedgerEnd);
}

// 5. Replace state variables and computed properties with hook calls inside App()
const oldStateBlockStart = code.indexOf("  const [pin, setPin] = useState('')");
const oldStateBlockEndStr = "  const [addLedgerName, setAddLedgerName] = useState('')\n";
const oldStateBlockEnd = code.indexOf(oldStateBlockEndStr) + oldStateBlockEndStr.length;

if (oldStateBlockStart !== -1 && oldStateBlockEnd !== -1 && oldStateBlockStart < oldStateBlockEnd) {
    const retainedStates = `  const [focusAccountId, setFocusAccountId] = useState(null)
  const [showAccountsHeader, setShowAccountsHeader] = useState(true)
  const [showBudgetSettings, setShowBudgetSettings] = useState(false)
  const [importFileData, setImportFileData] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showClientsManager, setShowClientsManager] = useState(false)
`;
    code = code.slice(0, oldStateBlockStart) + retainedStates + code.slice(oldStateBlockEnd);
}

const vaultStateLineStr = "  const [vault, setVaultState] = useState(() => normalizeVault(null))\n";
const vaultStateLineIndex = code.indexOf(vaultStateLineStr);
if (vaultStateLineIndex !== -1) {
  const insertIndex = vaultStateLineIndex + vaultStateLineStr.length;
  const hookCalls = `
  const {
    pin, setPin, pin2, setPin2, showLedgerPicker, setShowLedgerPicker,
    showAddLedgerModal, setShowAddLedgerModal, addLedgerName, setAddLedgerName,
    handlePinToggle, handleSetPin, handleUnlock, persist, updateSettings,
    persistActiveLedger, persistLedgerAndAccounts, handleAddPersonalLedger,
    handleAddBusinessLedger, handleSaveNewLedger, handleDeleteLedger,
    handleSelectLedger, handleSwitchLedgerToAccounts, activeLedger, allAccounts, allAccountTxns
  } = useVault({
    setStage, setTab, show, setSelectedCategory, setFocusAccountId,
    isVaultEmpty, normalizeVault, createLedger, vault, setVaultState
  });

  const {
    cloudBusy, cloudError, cloudStale, cloudLastBackup,
    backupNow, openRestorePicker, restoreFromCloud, startGoogleAuth,
    restoreFiles, setRestoreFiles, selectedRestoreId, setSelectedRestoreId,
    restorePin, setRestorePin, showRestoreModal, setShowRestoreModal
  } = useGoogleDrive({
    stage, setStage, settings: vault.settings, updateSettings, vault, persist, show, pin, setPin, setVaultState, setTab, DEFAULT_TAB
  });
`;
  code = code.slice(0, insertIndex) + hookCalls + code.slice(insertIndex);
}

// 6. Delete old computed ledger properties
const activeLedgerStartStr = "  const ledgers = vault.ledgers || []\n  const activeLedgerId = vault.activeLedgerId\n  const activeLedger = ledgers.find(l => l.id === activeLedgerId) || ledgers[0] || createLedger()\n  const allAccounts = vault.accounts || []\n  const allAccountTxns = vault.accountTxns || []\n";
const activeLedgerStart = code.indexOf(activeLedgerStartStr);
if (activeLedgerStart !== -1) {
  code = code.slice(0, activeLedgerStart) + code.slice(activeLedgerStart + activeLedgerStartStr.length);
}

const cloudGooglePropsStr = "  const cloudLastBackup = cloudGoogle.lastBackupAt ? new Date(cloudGoogle.lastBackupAt) : null\n  const cloudWarnDays = cloudBackup.warnDays || CLOUD_BACKUP_WARN_DAYS_DEFAULT\n  const cloudStale = cloudLastBackup\n    ? (Date.now() - cloudLastBackup.getTime()) > cloudWarnDays * 86400000\n    : cloudBackup.enabled\n";
const cloudGooglePropsStart = code.indexOf(cloudGooglePropsStr);
if (cloudGooglePropsStart !== -1) {
  code = code.slice(0, cloudGooglePropsStart) + code.slice(cloudGooglePropsStart + cloudGooglePropsStr.length);
}

fs.writeFileSync(appPath, code);

console.log("SURGERY COMPLETE.");
