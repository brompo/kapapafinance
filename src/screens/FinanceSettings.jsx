import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { fmtTZS } from '../money'

function BudgetSettings({ onClose }) {
  const { categoryMeta, expenseCats, activeLedger, persistActiveLedger, show } = useAppContext()
  const [draftBudgets, setDraftBudgets] = useState(() => {
    const map = {}
    expenseCats.forEach(c => {
      const meta = categoryMeta.expense?.[c] || { budget: 0 }
      map[c] = meta.budget || 0
    })
    return map
  })
  const totalBudget = Object.values(draftBudgets).reduce((s, v) => s + Number(v || 0), 0)

  function handleSaveBudgets() {
    const nextMeta = {
      ...categoryMeta,
      expense: { ...categoryMeta.expense }
    }
    expenseCats.forEach(c => {
      const current = categoryMeta.expense?.[c] || { budget: 0, subs: [] }
      nextMeta.expense[c] = { ...current, budget: Number(draftBudgets[c] || 0) }
    })
    persistActiveLedger({ ...activeLedger, categoryMeta: nextMeta })
    onClose()
    show('Budgets saved.')
  }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard" onClick={e => e.stopPropagation()}>
        <div className="modalTitle">Monthly Budgets</div>
        <div style={{ background: '#f1f5f9', padding: '10px 16px', borderRadius: 12, marginBottom: 20, textAlign: 'center', fontWeight: 700 }}>
          Total budget: {fmtTZS(totalBudget)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
          {expenseCats.map(c => (
            <div key={c} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{c}</div>
              <input
                className="input"
                inputMode="decimal"
                value={draftBudgets[c] ?? ''}
                onChange={e => setDraftBudgets(prev => ({ ...prev, [c]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="modalFooter" style={{ marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSaveBudgets}>Save Burgets</button>
        </div>
      </div>
    </div>
  )
}

function ClientsManager({ onClose }) {
  const { clients, persist, vault, activeLedger, allAccountTxns, rawAccounts, show } = useAppContext()
  
  function handleRename(client) {
    const newName = prompt('New client name?', client.name)
    if (newName && newName.trim() && newName !== client.name) {
      persist({ ...vault, clients: clients.map(c => c.id === client.id ? { ...c, name: newName.trim() } : c) })
    }
  }

  function handleDelete(client) {
    if (window.confirm(`Delete client "${client.name}"?`)) {
       persist({ ...vault, clients: clients.filter(c => c.id !== client.id) })
       show('Client deleted.')
    }
  }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard" onClick={e => e.stopPropagation()}>
        <div className="modalTitle">Manage Clients</div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {clients.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8' }}>No clients.</div> : 
             clients.map(c => (
               <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                 <div>{c.name}</div>
                 <div style={{ display: 'flex', gap: 8 }}>
                   <button className="iconBtn" onClick={() => handleRename(c)}>✎</button>
                   <button className="iconBtn danger" onClick={() => handleDelete(c)}>✕</button>
                 </div>
               </div>
             ))
          }
        </div>
        <div className="modalFooter" style={{ marginTop: 20 }}>
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function FinanceSettings({ onClose }) {
  const [showBudget, setShowBudget] = useState(false)
  const [showClients, setShowClients] = useState(false)

  return (
    <div className="subPageOverlay">
      <div className="subPageHeader">
        <button className="backBtn" onClick={onClose}>←</button>
        <h1 className="subPageTitle">Finance</h1>
      </div>
      <div className="subPageBody">
        <div className="card" style={{ margin: 0 }}>
          <button className="stgRow" onClick={() => setShowBudget(true)}>
             <div className="stgRowBody">
                <div style={{ fontWeight: 600 }}>Monthly Budgets</div>
                <div className="small">Set monthly spending limits per category.</div>
             </div>
             <div className="stgChevron">›</div>
          </button>
          <div className="hr" />
          <button className="stgRow" onClick={() => setShowClients(true)}>
             <div className="stgRowBody">
                <div style={{ fontWeight: 600 }}>Manage Clients</div>
                <div className="small">Edit or delete client entities.</div>
             </div>
             <div className="stgChevron">›</div>
          </button>
        </div>
      </div>
      {showBudget && <BudgetSettings onClose={() => setShowBudget(false)} />}
      {showClients && <ClientsManager onClose={() => setShowClients(false)} />}
    </div>
  )
}
