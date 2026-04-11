import React, { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { todayISO, fmtTZS, fmtCompact, calculateAssetMetrics, uid } from '../money'
import { CATEGORY_SUBS } from '../constants'
import { TransactionDetail } from '../components/TransactionDetail'

export function CategoryDetail({
  category,
  onClose,
  total,
  meta,
  onUpdateMeta,
  expenseCats = [],
  incomeCats = [],
  cosCats = [],
  oppsCats = [],
  allocationCats = [],
  showAddForm,
  setShowAddForm
}) {
  const {
    accounts, txns, activeLedger, accountTxns,
    addQuickTxn, updateTxn, delTxn, addReimbursement,
    show, persistActiveLedger, categoryMeta, settings, clients
  } = useAppContext()

  const [amount, setAmount] = useState('')
  const formatCommas = (str) => {
    if (!str) return '';
    const parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  const [amountError, setAmountError] = useState(false)
  const [prevValue, setPrevValue] = useState('')
  const [operator, setOperator] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [accountId, setAccountId] = useState(meta?.defaultAccountId || '')
  const [toAccountId, setToAccountId] = useState(meta?.defaultToAccountId || '')
  const [accountError, setAccountError] = useState(false)
  const [clientId, setClientId] = useState('')
  const [pendingClient, setPendingClient] = useState(null)

  const activeClients = pendingClient && !clients.find(c => c.id === pendingClient.id)
    ? [...clients, pendingClient]
    : clients;

  const [selectedSub, setSelectedSub] = useState('')
  const [subAccountId, setSubAccountId] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringFreq, setRecurringFreq] = useState('monthly')
  const [recurringCount, setRecurringCount] = useState(12)
  const [showReimburseModal, setShowReimburseModal] = useState(false)
  const [reimburseTxn, setReimburseTxn] = useState(null)
  const [reimburseAmount, setReimburseAmount] = useState('')
  const [reimburseAccountId, setReimburseAccountId] = useState('')
  const [reimburseSubAccountId, setReimburseSubAccountId] = useState('')
  const [reimburseDate, setReimburseDate] = useState(todayISO())
  const [isSaving, setIsSaving] = useState(false)

  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedTxnIds, setSelectedTxnIds] = useState([])
  const [highlightId, setHighlightId] = useState(null)

  const selectedAccount = accounts.find(a => a.id === accountId)
  const showSubAccountSelect = selectedAccount && Array.isArray(selectedAccount.subAccounts) && selectedAccount.subAccounts.length > 0
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editColor, setEditColor] = useState(meta?.color || '')
  const budget = meta?.budget || 0
  const subcats = meta?.subs?.length ? meta.subs : (CATEGORY_SUBS[category.name] || [])
  const colorOptions = ['#ffe8b6', '#ffe0cf', '#ffd9ec', '#e8dcff', '#dbeaff', '#e6f3ff', '#dff5e1', '#fff1c9', '#f0efe9']

  const spent = total
  const ratio = budget > 0 ? spent / budget : 0
  const [txnTab, setTxnTab] = useState('activity')

  const recentTxns = useMemo(() => {
    const today = todayISO();
    let regular = txns
      .filter(t => t.category === category.name)
      .map(t => ({ ...t, _sortDate: t.date, _isGain: false }))

    if (txnTab === 'activity') {
      regular = regular.filter(t => t.date <= today)
    } else {
      regular = regular.filter(t => t.date > today)
    }

    let gains = []
    if (category.type === 'income' && txnTab === 'activity') {
      const assets = accounts.filter(a => {
        const g = activeLedger.groups.find(g => g.id === a.groupId);
        return g && g.type === 'asset';
      });
      for (const acc of assets) {
        const info = calculateAssetMetrics(acc, accountTxns, 'asset');
        const catGains = info.realizedGains.filter(g => (g.category || 'Capital Gains') === category.name);
        gains = gains.concat(catGains.map(g => ({
          id: `gain-${g.date}-${g.symbol}`,
          date: g.date,
          amount: g.amount,
          category: category.name,
          type: 'income',
          note: `Gain from ${g.symbol}`,
          _sortDate: g.date,
          _isGain: true
        })));
      }
    }
    return [...regular, ...gains].sort((a, b) => b._sortDate.localeCompare(a._sortDate)).slice(0, 50)
  }, [txns, category.name, accounts, activeLedger.groups, accountTxns, txnTab])

  const groupedTxns = useMemo(() => {
    const map = new Map()
    for (const t of recentTxns) {
      const m = t.date.slice(0, 7)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(t)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [recentTxns])

  const onAddTxn = async (amount, note, accountId, toAccountId, date, subAccountId, clientId, recurring, pendingClient, updateDefaultAccount) => {
    return addQuickTxn({
      type: category.type,
      amount,
      category: category.name,
      note,
      accountId,
      toAccountId,
      date,
      subAccountId,
      clientId,
      recurring,
      pendingClient,
      updateDefaultAccount
    });
  }

  const openTxnDetail = (t) => {
    setSelectedTxn({
      id: `txn-${t.id}`,
      date: t.date,
      title: t.category || (t.type === 'income' ? 'Income' : 'Expense'),
      sub: t.note || '',
      amount: Number(t.amount || 0),
      direction: t.type === 'income' ? 'in' : 'out',
      type: t.type,
      category: t.category || '',
      accountId: t.accountId || '',
      note: t.note || '',
      kind: 'txn',
      raw: t
    })
  }

  if (selectedTxn) {
    return (
      <TransactionDetail
        txn={selectedTxn}
        accounts={accounts}
        expenseCats={expenseCats}
        incomeCats={incomeCats}
        cosCats={cosCats}
        oppsCats={oppsCats}
        allocationCats={allocationCats}
        settings={settings}
        show={show}
        categoryMeta={categoryMeta}
        onSave={(next) => updateTxn(selectedTxn.raw, next)}
        onClose={() => setSelectedTxn(null)}
        onDelete={() => {
          delTxn(selectedTxn.raw.id)
          setSelectedTxn(null)
        }}
        onReimburse={selectedTxn.type === 'expense' ? () => {
          const t = selectedTxn.raw
          setSelectedTxn(null)
          setReimburseTxn(t)
          const alreadyReimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
          setReimburseAmount(String(Number(t.amount || 0) - alreadyReimbursed))
          setShowReimburseModal(true)
        } : null}
      />
    )
  }

  return (
    <div className="catDetailScreen">
      <div className={`catDetailHeader ${!meta?.color ? category.theme || '' : ''}`} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 16px 12px', /* Standardized header padding */
        background: meta?.color || '#fff',
        borderBottom: meta?.color || showAddForm ? 'none' : '1px solid #dcfce7',
        position: 'sticky',
        top: 0,
        zIndex: 105
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <button className="iconBtn" onClick={onClose} type="button" style={{ marginTop: 2 }}>✕</button>
          <div>
            <div className="catDetailTitle" style={{ fontSize: 17, fontWeight: 700 }}>{category.name}</div>
            <button type="button" onClick={() => setShowEditModal(true)} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 11, textDecoration: 'underline', padding: 0 }}>Edit Card</button>
          </div>
        </div>
        {!showAddForm && <div style={{ fontSize: 23, fontWeight: 800 }}>{fmtTZS(total)}</div>}
        {showAddForm && (
          <button type="button" onClick={() => setShowAddForm(false)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none' }}>
            <div style={{ background: '#eef2ff', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📋</div>
            <span style={{ fontSize: 9, color: '#4b5563', fontWeight: 600 }}>View Transactions</span>
          </button>
        )}
      </div>

      {showEditModal && (
        <div className="modalBackdrop" onClick={() => setShowEditModal(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Edit Category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '10px 0' }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Category Name</div>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Card Color</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {colorOptions.map(c => (
                    <button key={c} onClick={() => setEditColor(c)} style={{ width: 36, height: 36, borderRadius: 18, background: c, border: editColor === c ? '3px solid #6366f1' : '1px solid #e2e8f0', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => {
                  const updatedLedger = {
                    ...activeLedger,
                    categories: {
                      ...activeLedger.categories,
                      [category.type]: activeLedger.categories[category.type].map(n => n === category.name ? editName : n)
                    },
                    categoryMeta: {
                      ...activeLedger.categoryMeta,
                      [category.type]: {
                        ...(activeLedger.categoryMeta[category.type] || {}),
                        [editName]: { ...(activeLedger.categoryMeta[category.type]?.[category.name] || {}), color: editColor }
                      }
                    }
                  }
                  persistActiveLedger(updatedLedger)
                  setShowEditModal(false)
                  show('Card updated.')
                }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddForm ? (
        <div className="catDetailForm" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', margin: '0 0 10px', fontWeight: 700, color: '#111827', display: 'flex', flexDirection: 'column' }}>
              {prevValue && operator && <div style={{ fontSize: 16, color: '#6b7280', marginBottom: 2 }}>{formatCommas(prevValue)} {operator}</div>}
              <div style={{ fontSize: 28, color: '#111827', marginBottom: 2, fontWeight: 800 }}>TSh</div>
              <div style={{ fontSize: 35 }}>{formatCommas(amount || '0')}</div>
            </div>

            <div className="catDetailFormGrid" style={{ display: 'grid', gridTemplateColumns: category.type === 'allocation' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 10 }}>
                  <option value="">{category.type === 'allocation' ? 'From' : 'Account'}</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div style={{ padding: '6px 4px', border: accountError ? '1px solid #f8a5a5' : '1px solid #eef2ff', background: accountId ? '#fef08a' : '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }}>
                  <span style={{ fontSize: 16 }}>🏦</span> <br /> {accountId ? accounts.find(a => a.id === accountId)?.name : (category.type === 'allocation' ? 'From' : 'Account')}
                </div>
              </div>

              {category.type === 'allocation' && (
                <div style={{ position: 'relative' }}>
                  <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 10 }}>
                    <option value="">To Account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <div style={{ padding: '6px 4px', border: '1px solid #eef2ff', background: toAccountId ? '#dcfce7' : '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }}>
                    <span style={{ fontSize: 16 }}>🎯</span> <br /> {toAccountId ? accounts.find(a => a.id === toAccountId)?.name : 'To'}
                  </div>
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 10 }} />
                <div style={{ padding: '6px 4px', border: '1px solid #eef2ff', background: '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }}>
                  <span style={{ fontSize: 16 }}>📅</span> <br /> {date === todayISO() ? 'Today' : date.split('-').slice(1).join('/')}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <input value={note} onChange={e => setNote(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 10 }} />
                <div style={{ padding: '6px 4px', border: '1px solid #eef2ff', background: note ? '#ffedd5' : '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }}>
                  <span style={{ fontSize: 16 }}>📝</span> <br /> {note || 'Note'}
                </div>
              </div>

              <button type="button" style={{ padding: '6px 4px', border: '1px solid #eef2ff', background: isRecurring ? '#a5eba5' : '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }} onClick={() => setIsRecurring(!isRecurring)}>
                <span style={{ fontSize: 16 }}>⟳</span> <br /> Repeat
              </button>
            </div>

            {/* Contextual Options Row (Tiny Line) */}
            {(showSubAccountSelect || isRecurring) && (
              <div style={{
                margin: '4px 4px 0px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '4px 0',
                borderTop: '1px solid #f8fafc'
              }}>
                {showSubAccountSelect && (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginRight: 4, alignSelf: 'center' }}>SUB:</span>
                    {selectedAccount.subAccounts.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSubAccountId(subAccountId === s.id ? '' : s.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid #e2e8f0',
                          background: subAccountId === s.id ? '#6366f1' : '#fff',
                          color: subAccountId === s.id ? '#fff' : '#4b5563',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}

                {isRecurring && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginRight: 4, alignSelf: 'center' }}>FREQ:</span>
                      {['Daily', 'Weekly', 'Monthly', 'Yearly'].map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setRecurringFreq(f.toLowerCase())}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                            background: recurringFreq === f.toLowerCase() ? '#10b981' : '#fff',
                            color: recurringFreq === f.toLowerCase() ? '#fff' : '#4b5563'
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginRight: 4, alignSelf: 'center' }}>COUNT:</span>
                      {[1, 3, 6, 12, 24, 36].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setRecurringCount(c)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            border: '1px solid #e2e8f0',
                            background: recurringCount === c ? '#10b981' : '#fff',
                            color: recurringCount === c ? '#fff' : '#4b5563'
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="customKeypad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
            {['+', '-', 'x', '/', '7', '8', '9', '=', '4', '5', '6', 'C', '1', '2', '3', '⌫', '.', '0', 'Save'].map((k) => (
              <button key={k} type="button" className="keypadBtn" style={{ gridColumn: k === 'Save' ? 'span 2' : 'auto', padding: '16px', fontSize: 20, fontWeight: 700, borderRadius: 12, border: '1px solid #e5e7eb', background: k === 'Save' ? '#ffd76a' : '#fff' }}
                onClick={() => {
                  const cleanAmount = (s) => s.toString().replace(/,/g, '');
                  const execCalc = (p, c, op) => {
                    const v1 = parseFloat(cleanAmount(p));
                    const v2 = parseFloat(cleanAmount(c));
                    if (isNaN(v1) || isNaN(v2)) return c;
                    if (op === '+') return String(v1 + v2);
                    if (op === '-') return String(v1 - v2);
                    if (op === 'x') return String(v1 * v2);
                    if (op === '/') return v2 !== 0 ? String(v1 / v2) : '0';
                    return c;
                  };

                  if (k === 'Save') {
                    let finalAmount = amount;
                    if (prevValue && operator && amount) {
                      finalAmount = execCalc(prevValue, amount, operator);
                    }
                    onAddTxn(finalAmount, note, accountId, toAccountId, date, subAccountId, clientId, isRecurring ? { freq: recurringFreq, count: recurringCount } : null, pendingClient, true);
                    setAmount(''); setNote(''); setPrevValue(''); setOperator(''); setShowAddForm(false);
                  } else if (k === '⌫') {
                    setAmount(prev => prev.slice(0, -1));
                  } else if (k === 'C') {
                    setAmount(''); setPrevValue(''); setOperator('');
                  } else if (['+', '-', 'x', '/'].includes(k)) {
                    if (amount && prevValue && operator) {
                      setPrevValue(execCalc(prevValue, amount, operator));
                      setOperator(k);
                      setAmount('');
                    } else if (amount) {
                      setPrevValue(amount);
                      setOperator(k);
                      setAmount('');
                    }
                  } else if (k === '=') {
                    if (prevValue && operator && amount) {
                      setAmount(execCalc(prevValue, amount, operator));
                      setPrevValue('');
                      setOperator('');
                    }
                  } else {
                    if (k === '.' && amount.includes('.')) return;
                    setAmount(prev => prev + k);
                  }
                }}
              >{k}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="catDetailHistory" style={{ padding: '4px 16px 40px' }}>
          <button className="btn" style={{ width: '100%', marginBottom: 15, background: '#ffd76a', fontSize: 13, height: 44, marginTop: 12 }} onClick={() => setShowAddForm(true)}>+ Add {category.type === 'income' ? 'Income' : 'Expense'}</button>

          <div className="modeSegmented" style={{
            display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12,
            marginBottom: 16
          }}>
            <button
              onClick={() => setTxnTab('activity')}
              style={{
                flex: 1, padding: '8px', borderRadius: 10,
                background: txnTab === 'activity' ? '#fff' : 'transparent',
                border: 'none', fontWeight: 700, fontSize: 12,
                color: txnTab === 'activity' ? '#5a5fb0' : '#64748b',
                boxShadow: txnTab === 'activity' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
              }}
            >Activity</button>
            <button
              onClick={() => setTxnTab('future')}
              style={{
                flex: 1, padding: '8px', borderRadius: 10,
                background: txnTab === 'future' ? '#fff' : 'transparent',
                border: 'none', fontWeight: 700, fontSize: 12,
                color: txnTab === 'future' ? '#5a5fb0' : '#64748b',
                boxShadow: txnTab === 'future' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
              }}
            >Future</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{txnTab === 'activity' ? 'Recent' : 'Upcoming'} {category.name}</span>
            <button onClick={() => setIsSelectMode(!isSelectMode)} style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>{isSelectMode ? 'Cancel' : 'Select'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {groupedTxns.map(([m, items]) => {
              const monthName = new Date(m + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
              const totalOut = items.reduce((s, t) => s + (t.type !== 'income' ? Number(t.amount || 0) : 0), 0)
              const totalIn = items.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount || 0) : 0), 0)
              return (
                <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 4px', borderBottom: '1px solid #f8fafc'
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>{monthName}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: totalOut > 0 ? '#ef4444' : '#10b981' }}>
                      {totalOut > 0 ? `OUT ${fmtCompact(totalOut)}` : `IN ${fmtCompact(totalIn)}`}
                    </div>
                  </div>
                  {items.map(t => (
                    <div key={t.id} className="catHistoryRow" onClick={() => openTxnDetail(t)} style={{
                      padding: '10px 12px',
                      borderRadius: 16,
                      background: '#fff',
                      border: '0.5px solid #eef2ff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 16,
                        background: '#fff', border: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, color: '#64748b'
                      }}>
                        {category.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="catHistoryInfo">
                        <div className="catHistoryTitleRow" style={{ fontSize: 13, fontWeight: 700 }}>{t.note || category.name}</div>
                        <div className="catHistoryMeta" style={{ fontSize: 11 }}>
                          {new Date(t.date).getDate()} {new Date(t.date).toLocaleString('default', { month: 'short' })}
                          {t.accountId && ` • ${accounts.find(a => a.id === t.accountId)?.name}`}
                        </div>
                      </div>
                      <div className={`catHistoryAmount ${t.type === 'income' ? 'pos' : 'neg'}`} style={{ fontSize: 14, fontWeight: 700 }}>
                        {t.type === 'income' ? '+' : '-'}{fmtTZS(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {groupedTxns.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No {txnTab} transactions found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
