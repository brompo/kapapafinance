export function fmtTZS(amount){
  const n = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-TZ', { style:'currency', currency:'TZS', maximumFractionDigits:0 }).format(n)
  } catch {
    return `TZS ${Math.round(n).toLocaleString()}`
  }
}

export function monthKey(dStr){
  const d = new Date(dStr)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  return `${y}-${m}`
}

export function todayISO(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
