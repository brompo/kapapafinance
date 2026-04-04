import React, { useState } from 'react'
import { todayISO, uid } from '../money'
import { CATEGORY_SUBS } from '../constants'

export function TransactionDetail({ txn, accounts, expenseCats = [], incomeCats = [], cosCats = [], oppsCats = [], allocationCats = [], onSave, onClose, onDelete, onReimburse, clients = [], settings = {}, show, categoryMeta = {} }) {
  const isEditable = !txn.kind || txn.kind === 'txn'
  const [type, setType] = useState(txn.type || 'expense')
  const [amount, setAmount] = useState(String(txn.amount || ''))
  const [amountError, setAmountError] = useState(false)
  const [category, setCategory] = useState(txn.category || '')
  const [accountId, setAccountId] = useState(txn.accountId || '')
  const [toAccountId, setToAccountId] = useState(txn.toAccountId || '')
  const [accountError, setAccountError] = useState(false)
  const [clientId, setClientId] = useState(txn.raw?.clientId || '')
  const [pendingClient, setPendingClient] = useState(null)

  const activeClients = pendingClient && !clients.find(c => c.id === pendingClient.id)
    ? [...clients, pendingClient]
    : clients;
  const [date, setDate] = useState(txn.date || todayISO())

  const [subCategory, setSubCategory] = useState(() => {
    if (txn.raw?.subCategory) return txn.raw.subCategory;
    if (!txn.note) return ''
    if (txn.note.includes(' • ')) {
      const [head] = txn.note.split(' • ')
      return head || ''
    }
    return ''
  })
  const [note, setNote] = useState(() => {
    if (!txn.note) return ''
    const parts = txn.note.split(' • ')
    if (parts.length > 1) return parts.slice(1).join(' • ')
    return txn.note
  })

  const labelType = type === 'income' ? 'Income' :
    type === 'cos' ? 'Cost of Sales' :
      type === 'opps' ? 'Operating Expenses' :
        type === 'allocation' ? 'Allocation' : 'Expense'
  const categoryOptions = type === 'income' ? incomeCats :
    type === 'cos' ? cosCats :
      type === 'opps' ? oppsCats :
        type === 'allocation' ? allocationCats : expenseCats

  const subOptions = (categoryMeta[type]?.[category]?.subs) || CATEGORY_SUBS[category] || []

  function handleSave() {
    if (!isEditable) return
    const amt = Number(amount || 0)
    if (!amt || amt <= 0) {
      setAmountError(true)
      show('Enter a valid amount.')
      return
    }
    if (settings.requireAccountForTxns && !accountId) {
      setAccountError(true)
      show('Please select an account.')
      return
    }
    setAccountError(false)

    const combinedNote = subCategory ? `${subCategory}${note ? ` • ${note}` : ''}` : note;

    onSave?.({
      ...txn.raw,
      type,
      amount: amt,
      category: category || '',
      subCategory: subCategory || '',
      note: combinedNote || '',
      rawNote: note || '',
      accountId: accountId || '',
      toAccountId: toAccountId || '',
      clientId: clientId || '',
      date: date || todayISO()
    }, pendingClient)
    onClose()
  }

  const accountName = accounts.find(a => a.id === accountId)?.name || ''

  return (
    <div className="txnDetailScreen">
      <div className="txnDetailHeader">
        <button className="iconBtn" onClick={onClose} type="button">✕</button>
        <div className="txnDetailTitle">Transaction Details</div>
        <div style={{ width: 32 }}></div>
      </div>

      <div className="card" style={{ margin: '0 10px' }}>
        <div className="field">
          <label style={{ fontWeight: 600, color: type === 'income' ? 'var(--ok)' : 'var(--danger)' }}>
            Amount (TZS)
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 12, fontWeight: 700, fontSize: 18, color: 'var(--muted)' }}>
              {type === 'income' ? '+' : '-'}
            </span>
            <input
              className="txnAmountInput"
              inputMode="decimal"
              value={amount}
              onChange={e => {
                setAmount(e.target.value)
                if (e.target.value && Number(e.target.value) > 0) setAmountError(false)
              }}
              placeholder="0"
              style={{ paddingLeft: 30, fontSize: 20, fontWeight: 700, border: amountError ? '1px solid var(--danger)' : '' }}
              disabled={!isEditable}
              autoFocus={!txn.id || !txn.id.toString().startsWith('txn-')}
            />
          </div>
          {amountError && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>Please enter a valid amount</div>}
        </div>

        <div className="txnDetailGrid">
          <div className="txnDetailRow">
            <div className="txnDetailLabel">Type</div>
            {isEditable ? (
              <select className="txnDetailSelect" value={type} onChange={e => {
                setType(e.target.value); setCategory(''); setSubCategory('')
              }}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                {cosCats && cosCats.length > 0 && <option value="cos">Cost of Sales</option>}
                {oppsCats && oppsCats.length > 0 && <option value="opps">Operating Expenses</option>}
                <option value="allocation">Allocation</option>
              </select>
            ) : (
              <div className="txnDetailValue">{labelType}</div>
            )}
          </div>

          <div className="txnDetailRow">
            <div className="txnDetailLabel">Category</div>
            {isEditable ? (
              <select className="txnDetailSelect" value={category} onChange={e => {
                setCategory(e.target.value); setSubCategory('')
              }}>
                <option value="">None</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <div className="txnDetailValue">{txn.category || 'None'}</div>
            )}
          </div>

          <div className="txnDetailRow">
            <div className="txnDetailLabel">Subcategory</div>
            {isEditable ? (
              subOptions.length > 0 ? (
                <select className="txnDetailSelect" value={subCategory} onChange={e => setSubCategory(e.target.value)}>
                  <option value="">None</option>
                  {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input className="txnDetailInput" value={subCategory} onChange={e => setSubCategory(e.target.value)} placeholder="None" />
              )
            ) : (
              <div className="txnDetailValue">{subCategory || 'None'}</div>
            )}
          </div>

          <div className="txnDetailRow">
            <div className="txnDetailLabel">{type === 'allocation' ? 'Source Account' : 'Account'}</div>
            {isEditable ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <select className="txnDetailSelect" value={accountId} onChange={e => {
                  setAccountId(e.target.value); if (e.target.value) setAccountError(false)
                }} style={accountError ? { borderColor: 'var(--danger)' } : {}}>
                  <option value="">None</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {accountError && <div className="small" style={{ color: 'var(--danger)', marginTop: 2 }}>Required</div>}
              </div>
            ) : (
              <div className="txnDetailValue">{accountName || 'None'}</div>
            )}
          </div>

          {type === 'allocation' && (
            <div className="txnDetailRow">
              <div className="txnDetailLabel">Destination Account</div>
              {isEditable ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <select className="txnDetailSelect" value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                    <option value="">None</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="txnDetailValue">{accounts.find(a => a.id === toAccountId)?.name || 'None'}</div>
              )}
            </div>
          )}

          {type === 'income' && (
            <div className="txnDetailRow">
              <div className="txnDetailLabel">Client</div>
              {isEditable ? (
                <select className="txnDetailSelect" value={clientId} onChange={e => {
                    if (e.target.value === 'new') {
                      const name = prompt('New client name?');
                      if (name && name.trim()) {
                        const newClient = { id: uid(), name: name.trim() };
                        setPendingClient(newClient);
                        setClientId(newClient.id);
                      }
                    } else { setClientId(e.target.value) }
                  }}>
                  <option value="">None</option>
                  {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="new">+ Add New Client</option>
                </select>
              ) : (
                <div className="txnDetailValue">{clients.find(c => c.id === clientId)?.name || 'None'}</div>
              )}
            </div>
          )}

          <div className="txnDetailRow">
            <div className="txnDetailLabel">Date</div>
            {isEditable ? (
              <input className="txnDetailInput" type="date" value={date} onChange={e => setDate(e.target.value)} />
            ) : (
              <div className="txnDetailValue">{txn.date}</div>
            )}
          </div>
        </div>

        <div className="hr" />

        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Notes</label>
          <div className="txnDetailNote" style={{ padding: 0, border: 'none', boxShadow: 'none' }}>
            {isEditable ? (
              <textarea className="txnDetailTextarea" value={note} onChange={e => setNote(e.target.value)} placeholder="What was this for?" style={{ minHeight: 80 }} />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{note || 'No notes added.'}</div>
            )}
          </div>
        </div>

        <div className="txnDetailFooter">
          {onDelete && isEditable && (
            <button className="pillBtn danger" type="button" onClick={() => { if (confirm('Delete this transaction?')) onDelete() }} style={{ padding: '8px 16px', fontSize: 13, flex: 1, justifyContent: 'center', display: 'flex' }}>Delete</button>
          )}
          {onReimburse && (
            <button className="pillBtn" type="button" onClick={onReimburse} style={{ flex: 1, padding: '8px 16px', fontSize: 13, justifyContent: 'center', display: 'flex', background: '#f8f9fc', borderColor: '#e2e8f0', color: '#4a5568' }}>Reimburse</button>
          )}
          <button className="pillBtn" type="button" disabled={!isEditable} onClick={handleSave} style={{ flex: 1, padding: '8px 16px', fontSize: 13, justifyContent: 'center', display: 'flex' }}>Save</button>
        </div>
      </div>
    </div>
  )
}
