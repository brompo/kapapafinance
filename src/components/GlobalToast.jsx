import React from 'react'
import { useAppContext } from '../context/AppContext'

export function GlobalToast() {
  const { toast } = useAppContext()
  if (!toast) return null
  return <div className="toast">{toast}</div>
}
