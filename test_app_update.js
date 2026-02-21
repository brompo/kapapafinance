import fs from 'fs';

let file = fs.readFileSync('src/App.jsx', 'utf8');
const applyRegex = /function applyAccountDelta\(nextAccounts, accountId, subAccountId, delta\) \{[\s\S]*?return \{ \.\.\.a, subAccounts: nextSubs \}\n    \}\)\n  \}/;

const match = file.match(applyRegex);
if (match) {
  console.log("Found applyAccountDelta");
} else {
  console.log("Could not find applyAccountDelta");
}
