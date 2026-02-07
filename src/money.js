export function fmtTZS(amount) {
  const n = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n)
  } catch {
    return Math.round(n).toLocaleString()
  }
}

export function monthKey(dStr) {
  const d = new Date(dStr)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fmtCompact(amount) {
  const n = Number(amount || 0);
  if (Math.abs(n) >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1) + 'B';
  }
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M';
  }
  return fmtTZS(amount);
}
