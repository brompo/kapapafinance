import fs from 'fs';

const appPath = './src/App.jsx.bak'; // Checking against original backup
const code = fs.readFileSync(appPath, 'utf8');

const restoreBackupStart = code.indexOf('  async function backupNow({ silent = false } = {}) {');

const restoreBackupEndStr = "  useEffect(() => {\n    if (stage !== 'app') return\n    if (!cloudBackup.enabled || !cloudGoogle.refreshToken) return\n    let lastAuto = 0\n    const minInterval = 5 * 60 * 1000\n    const handler = () => {\n      const now = Date.now()\n      if (now - lastAuto < minInterval) return\n      lastAuto = now\n      backupNow({ silent: true })\n    }\n    const onVisibility = () => {\n      if (document.visibilityState === 'hidden') handler()\n    }\n    window.addEventListener('beforeunload', handler)\n    document.addEventListener('visibilitychange', onVisibility)\n    return () => {\n      window.removeEventListener('beforeunload', handler)\n      document.removeEventListener('visibilitychange', onVisibility)\n    }\n  }, [stage, cloudBackup.enabled, cloudGoogle.refreshToken])\n";
const restoreBackupEnd = code.indexOf(restoreBackupEndStr);

const activeLedgerStartStr = "  const ledgers = vault.ledgers || []\n  const activeLedgerId = vault.activeLedgerId\n  const activeLedger = ledgers.find(l => l.id === activeLedgerId) || ledgers[0] || createLedger()\n  const allAccounts = vault.accounts || []\n  const allAccountTxns = vault.accountTxns || []\n";
const activeLedgerStart = code.indexOf(activeLedgerStartStr);

console.log('restoreBackupStart:', restoreBackupStart);
console.log('restoreBackupEnd:', restoreBackupEnd);
console.log('activeLedgerStart:', activeLedgerStart);
