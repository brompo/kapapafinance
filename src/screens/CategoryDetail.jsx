import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { todayISO, fmtTZS, fmtCompact, calculateAssetMetrics, uid } from '../money'
import { CATEGORY_SUBS } from '../constants'
import { getGrowthPercentForMonth, withGrowthPercentForMonth, getBudgetForMonth, withBudgetForMonth } from '../utils/ledger'
import { TransactionDetail } from '../components/TransactionDetail'

export function CategoryDetail({
  category,
  month,
  onClose,
  total,
  meta,
  onUpdateMeta,
  expenseCats = [],
  incomeCats = [],
  allocationCats = [],
  growthCats = [],
  showAddForm,
  setShowAddForm
}) {
  const {
    accounts, txns, tab, groups, categories, accountTxns, book,
    addQuickTxn, updateTxn, delTxn, addReimbursement,
    show, persistBook, categoryMeta, settings, clients, formatMonthLabel
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
  // Flow (viewing a past period) can hand in an initialDate to pre-date a
  // transaction opened from one of its rows; every other entry point (the
  // Transactions category grid) leaves it unset and gets today, as before.
  const [date, setDate] = useState(category.initialDate || todayISO())
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
  const [reimburseError, setReimburseError] = useState(false)

  const handleOpenReimburse = (t) => {
    const alreadyReimbursed = (t.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    setReimburseTxn(t)
    setReimburseAmount(String(Number(t.amount || 0) - alreadyReimbursed))
    setReimburseDate(todayISO())
    setReimburseError(false)
    setShowReimburseModal(true)
  }
  const [isSaving, setIsSaving] = useState(false)

  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedTxnIds, setSelectedTxnIds] = useState([])
  const [highlightId, setHighlightId] = useState(null)

  const selectedAccount = accounts.find(a => a.id === accountId)
  const showSubAccountSelect = selectedAccount && Array.isArray(selectedAccount.subAccounts) && selectedAccount.subAccounts.length > 0
  const [selectedTxn, setSelectedTxn] = useState(null)
  
  const reimburseAccount = accounts.find(a => a.id === reimburseAccountId)
  const showReimburseSubSelect = reimburseAccount && Array.isArray(reimburseAccount.subAccounts) && reimburseAccount.subAccounts.length > 0
  
  // Collections have no categories/categoryMeta bucket of their own — they reuse
  // Income's, so any read/write keyed by category.type must resolve through this.
  const metaType = category.type === 'collection' ? 'income' : category.type

  // Budget/percent history is scoped to whichever month the caller (HomeScreen's
  // month navigator) has selected — not necessarily today's real calendar month —
  // so edits made while viewing December land on December, not on today.
  const editMonthKey = month || todayISO().slice(0, 7)

  // A Growth pool flagged fundsUpkeep is silent: it no longer accepts new
  // transactions (its distribution is redirected to Upkeep instead), so the
  // Add-transaction keypad is forced off regardless of the showAddForm prop
  // (which AppContext's handleSelectCategory defaults to true on every tap).
  const isSilentGrowth = category.type === 'growth' && !!meta?.fundsUpkeep

  // Projects: a lightweight budgeting checklist scoped to this category,
  // modeled on the Accounts screen's Goals & Targets planner but one level
  // deeper — a Project (e.g. "Home Improvement") groups several Expenditures
  // (e.g. "Toilet Sink", "Electrical Fundi"), each with its own projected
  // cost. Spend is logged straight from an expenditure (via the same
  // add-transaction keypad as the rest of this screen) so it's a real,
  // tagged transaction against this category — not a parallel ledger.
  // Pipeline-only, same gate as the rest of Flow's category-level surface.
  const pipelineMode = tab !== 'tx'
  const projects = Array.isArray(meta?.projects) ? meta.projects : []
  const [expandedProjectId, setExpandedProjectId] = useState(null)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [addExpenditureFor, setAddExpenditureFor] = useState(null) // project id
  const [newExpenditureName, setNewExpenditureName] = useState('')
  const [newExpenditureAmount, setNewExpenditureAmount] = useState('')
  // Set right before opening the add-transaction keypad from an expenditure's
  // "Log Expense" button, so the resulting transaction is tagged as it's
  // created rather than needing a separate assignment step afterward.
  const [logExpenseTarget, setLogExpenseTarget] = useState(null) // { projectId, expenditureId }

  const spentByExpenditureId = useMemo(() => {
    const map = new Map()
    for (const t of txns) {
      if (t.category === category.name && t.type === category.type && t.expenditureId) {
        map.set(t.expenditureId, (map.get(t.expenditureId) || 0) + Number(t.amount || 0))
      }
    }
    return map
  }, [txns, category.name, category.type])

  const projectsWithTotals = useMemo(() => projects.map(p => {
    const expenditures = (Array.isArray(p.expenditures) ? p.expenditures : []).map(e => ({
      ...e,
      spent: spentByExpenditureId.get(e.id) || 0
    }))
    const projected = expenditures.reduce((s, e) => s + Number(e.amount || 0), 0)
    const spent = expenditures.reduce((s, e) => s + e.spent, 0)
    return { ...p, expenditures, projected, spent }
  }), [projects, spentByExpenditureId])

  const logExpenseLabel = useMemo(() => {
    if (!logExpenseTarget) return null
    const project = projectsWithTotals.find(p => p.id === logExpenseTarget.projectId)
    const expenditure = project?.expenditures.find(e => e.id === logExpenseTarget.expenditureId)
    return project && expenditure ? `${expenditure.name} · ${project.name}` : null
  }, [logExpenseTarget, projectsWithTotals])

  const totalProjected = projectsWithTotals.reduce((s, p) => s + p.projected, 0)
  const totalRemaining = projectsWithTotals.reduce((s, p) => s + Math.max(0, p.projected - p.spent), 0)
  // `total` is this category's headline Balance figure whenever Projects is
  // visible (pipelineMode) — see HomeScreen's growthDetailTotal/lifestyleDetailTotal,
  // which pass the envelope Balance, not a plain spend sum, under that same gate.
  const shortfall = totalRemaining - total

  const persistProjects = (nextProjects) => onUpdateMeta({ ...meta, projects: nextProjects })

  const handleAddProject = () => {
    const name = newProjectName.trim()
    if (!name) return show('Enter a project name.')
    persistProjects([...projects, { id: uid(), name, expenditures: [] }])
    setNewProjectName('')
    setShowAddProjectModal(false)
    setExpandedProjectId(null)
    show('Project added.')
  }

  const handleAddExpenditure = () => {
    const name = newExpenditureName.trim()
    const amt = Number(String(newExpenditureAmount).replace(/,/g, '')) || 0
    if (!name || amt <= 0) return show('Enter a valid name and projected cost.')
    persistProjects(projects.map(p => p.id === addExpenditureFor
      ? { ...p, expenditures: [...(Array.isArray(p.expenditures) ? p.expenditures : []), { id: uid(), name, amount: amt }] }
      : p))
    setNewExpenditureName('')
    setNewExpenditureAmount('')
    setAddExpenditureFor(null)
    show('Expenditure added.')
  }

  // Deleting keeps any transactions already logged against it — same
  // precedent as deleting a category (see Delete Category below): the money
  // was really spent, only the planning entry (and its tag) goes away. Both
  // the meta change and the txn untagging land in one persistBook call since
  // persistBook merges onto a book snapshot closed over at render time —
  // two separate calls in the same handler would clobber each other.
  const handleDeleteProject = (project) => {
    const spent = (project.expenditures || []).reduce((s, e) => s + (spentByExpenditureId.get(e.id) || 0), 0)
    const warn = spent > 0
      ? `Delete "${project.name}"? It has ${fmtTZS(spent)} logged — existing transactions are kept but will no longer show under this project.`
      : `Delete "${project.name}"? This can't be undone.`
    if (!window.confirm(warn)) return
    persistBook({
      categoryMeta: { ...categoryMeta, [metaType]: { ...categoryMeta[metaType], [category.name]: { ...meta, projects: projects.filter(p => p.id !== project.id) } } },
      txns: txns.map(t => t.projectId === project.id ? { ...t, projectId: '', expenditureId: '' } : t)
    })
    if (expandedProjectId === project.id) setExpandedProjectId(null)
    show('Project deleted.')
  }

  const handleDeleteExpenditure = (project, expenditure) => {
    const spent = spentByExpenditureId.get(expenditure.id) || 0
    const warn = spent > 0
      ? `Delete "${expenditure.name}"? It has ${fmtTZS(spent)} logged — existing transactions are kept but will no longer show under this project.`
      : `Delete "${expenditure.name}"? This can't be undone.`
    if (!window.confirm(warn)) return
    const nextProjects = projects.map(p => p.id === project.id
      ? { ...p, expenditures: (p.expenditures || []).filter(e => e.id !== expenditure.id) }
      : p)
    persistBook({
      categoryMeta: { ...categoryMeta, [metaType]: { ...categoryMeta[metaType], [category.name]: { ...meta, projects: nextProjects } } },
      txns: txns.map(t => t.expenditureId === expenditure.id ? { ...t, projectId: '', expenditureId: '' } : t)
    })
    show('Expenditure deleted.')
  }

  const effectiveShowAddForm = showAddForm && !isSilentGrowth

  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editColor, setEditColor] = useState(meta?.color || '')
  const [editNeedsCompliance, setEditNeedsCompliance] = useState(!!meta?.needsCompliance)
  const [editFundsUpkeep, setEditFundsUpkeep] = useState(!!meta?.fundsUpkeep)
  const [editStartOnProjects, setEditStartOnProjects] = useState(!!meta?.startOnProjects)
  const [editBudget, setEditBudget] = useState(String(
    category.type === 'allocation' ? getBudgetForMonth(meta, editMonthKey) : (meta?.budget || 0)
  ))
  const [editPercent, setEditPercent] = useState(String(getGrowthPercentForMonth(meta, editMonthKey) || 0))
  const [editOpeningBalance, setEditOpeningBalance] = useState(String(meta?.openingBalance || 0))
  // Growth percentages should sum to 100% — this is what the other pools
  // already claim as of the viewed month, so Save can warn/block before this
  // one pushes the total over.
  const otherGrowthPercentTotal = category.type === 'growth'
    ? growthCats
      .filter(name => name !== category.name)
      .reduce((s, name) => s + getGrowthPercentForMonth(categoryMeta.growth?.[name], editMonthKey), 0)
    : 0
  const enteredGrowthPercent = Number(String(editPercent).replace(/,/g, '')) || 0
  const projectedGrowthTotal = otherGrowthPercentTotal + enteredGrowthPercent
  const growthOverBy = category.type === 'growth' ? projectedGrowthTotal - 100 : 0
  const budget = category.type === 'allocation' ? getBudgetForMonth(meta, editMonthKey) : (meta?.budget || 0)
  const subcats = meta?.subs?.length ? meta.subs : (CATEGORY_SUBS[category.name] || [])
  const colorOptions = ['#ffe8b6', '#ffe0cf', '#ffd9ec', '#e8dcff', '#dbeaff', '#e6f3ff', '#dff5e1', '#fff1c9', '#f0efe9']

  const spent = total
  const ratio = budget > 0 ? spent / budget : 0
  // "Start on Projects": a per-category opt-in (set via Edit Card) that skips
  // the amount-entry keypad this card would otherwise open to and lands
  // straight on its Projects tab instead — useful for buckets you mostly
  // visit to plan/track rather than log a quick spend against. Both reads
  // only fire once, at mount, since CategoryDetail remounts fresh every time
  // a category is opened (selectedCategory clears to null on close).
  const startsOnProjects = pipelineMode && !!meta?.startOnProjects
  const [txnTab, setTxnTab] = useState(() => startsOnProjects ? 'projects' : 'activity')
  useLayoutEffect(() => {
    if (startsOnProjects) setShowAddForm(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        const g = groups.find(g => g.id === a.groupId);
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
    // Bucket-to-bucket transfers move money by adjusting openingBalance
    // directly (see FlowScreen's saveTransfer) — there's no real txns row for
    // them, so without this they'd vanish from both buckets' history. Merge
    // in a synthetic row (tap to delete + reverse, see handleDeleteTransfer)
    // wherever this category was either side of a transfer.
    let transfers = []
    if (category.type === 'allocation' || category.type === 'growth') {
      transfers = (Array.isArray(book?.transfers) ? book.transfers : [])
        .filter(tr => (tr.fromType === category.type && tr.fromName === category.name) || (tr.toType === category.type && tr.toName === category.name))
        .map(tr => {
          const isOutgoing = tr.fromType === category.type && tr.fromName === category.name
          return {
            id: `transfer-${tr.id}`,
            date: tr.date,
            amount: tr.amount,
            category: category.name,
            type: category.type,
            note: isOutgoing ? `Transferred to ${tr.toName}` : `Transferred from ${tr.fromName}`,
            _sortDate: tr.date,
            _isGain: false,
            _isTransfer: true,
            _transferIn: !isOutgoing,
            _transferId: tr.id,
            _fromType: tr.fromType,
            _fromName: tr.fromName,
            _toType: tr.toType,
            _toName: tr.toName
          }
        })
      transfers = txnTab === 'activity' ? transfers.filter(t => t.date <= today) : transfers.filter(t => t.date > today)
    }

    return [...regular, ...gains, ...transfers].sort((a, b) => b._sortDate.localeCompare(a._sortDate)).slice(0, 50)
  }, [txns, category.name, category.type, accounts, groups, accountTxns, txnTab, book])

  const groupedTxns = useMemo(() => {
    const map = new Map()
    for (const t of recentTxns) {
      if (!map.has(t.date)) map.set(t.date, [])
      map.get(t.date).push(t)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [recentTxns])

  const isInflowRow = (t) => t._isTransfer ? t._transferIn : (t.type === 'income' || t.type === 'collection')

  // Reverses a transfer: undoes both buckets' openingBalance adjustments
  // (mirrors FlowScreen's saveTransfer, in the opposite direction) and drops
  // the log entry, in one persistBook call so neither side is left stale.
  const handleDeleteTransfer = (t) => {
    const { _transferId, _fromType, _fromName, _toType, _toName, amount } = t
    const warn = `Delete this transfer? ${fmtTZS(amount)} will be moved back from ${_toName} to ${_fromName}.`
    if (!window.confirm(warn)) return
    const fromMeta = categoryMeta[_fromType]?.[_fromName] || {}
    const toMeta = categoryMeta[_toType]?.[_toName] || {}
    const nextCategoryMeta = { ...categoryMeta }
    nextCategoryMeta[_fromType] = {
      ...nextCategoryMeta[_fromType],
      [_fromName]: { ...fromMeta, openingBalance: Number(fromMeta.openingBalance || 0) + amount }
    }
    nextCategoryMeta[_toType] = {
      ...nextCategoryMeta[_toType],
      [_toName]: { ...(nextCategoryMeta[_toType]?.[_toName] || toMeta), openingBalance: Number(toMeta.openingBalance || 0) - amount }
    }
    persistBook({
      categoryMeta: nextCategoryMeta,
      transfers: (Array.isArray(book?.transfers) ? book.transfers : []).filter(tr => tr.id !== _transferId)
    })
    show('Transfer deleted — amounts reversed.')
  }

  const onAddTxn = async (amount, note, accountId, toAccountId, date, subAccountId, clientId, recurring, pendingClient, updateDefaultAccount, projectTag) => {
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
      updateDefaultAccount,
      ...(projectTag && { projectId: projectTag.projectId, expenditureId: projectTag.expenditureId }),
      // Collections inherit their category's compliance requirement — if the
      // category needs compliance, new entries start pending until cleared.
      ...(category.type === 'collection' && {
        needsCompliance: !!meta?.needsCompliance,
        complianceAmount: meta?.needsCompliance ? '' : 0
      })
    });
  }

  const openTxnDetail = (t) => {
    setSelectedTxn({
      id: `txn-${t.id}`,
      date: t.date,
      title: t.category || ((t.type === 'income' || t.type === 'collection') ? 'Income' : 'Expense'),
      sub: t.note || '',
      amount: Number(t.amount || 0),
      direction: (t.type === 'income' || t.type === 'collection') ? 'in' : 'out',
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
        allocationCats={allocationCats}
        growthCats={growthCats}
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
          handleOpenReimburse(selectedTxn.raw)
          setSelectedTxn(null)
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
        borderBottom: meta?.color || effectiveShowAddForm ? 'none' : '1px solid #dcfce7',
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
        {!effectiveShowAddForm && <div style={{ fontSize: 23, fontWeight: 800 }}>{fmtTZS(total)}</div>}
        {effectiveShowAddForm && (
          <button type="button" onClick={() => { setShowAddForm(false); setLogExpenseTarget(null) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none' }}>
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
              {category.type === 'collection' && (
                <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Needs Compliance</div>
                    <div className="small">New collections in this category start Pending until a compliance amount is set, and are excluded from Income until cleared.</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={editNeedsCompliance} onChange={e => setEditNeedsCompliance(e.target.checked)} />
                    <span className="toggleTrack" />
                  </label>
                </div>
              )}
              {(category.type === 'allocation' || category.type === 'expense') && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Monthly Target (TZS)</div>
                  <input className="input" inputMode="decimal" value={editBudget} onChange={e => setEditBudget(e.target.value)} placeholder="e.g. 100000" />
                  {category.type === 'allocation' && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Applies from {formatMonthLabel(editMonthKey)} onward — earlier months keep their existing target.</div>
                  )}
                </div>
              )}
              {category.type === 'growth' && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Target % of Surplus</div>
                  <input className="input" inputMode="decimal" value={editPercent} onChange={e => setEditPercent(e.target.value)} placeholder="e.g. 30" />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Applies from {formatMonthLabel(editMonthKey)} onward — earlier months keep their existing %.</div>
                  <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, color: growthOverBy > 0 ? '#ef4444' : '#94a3b8' }}>
                    {growthOverBy > 0
                      ? `Growth pools would total ${projectedGrowthTotal}% — ${growthOverBy}% over 100%.`
                      : projectedGrowthTotal < 100
                        ? `Growth pools would total ${projectedGrowthTotal}% — ${100 - projectedGrowthTotal}% left unallocated.`
                        : 'Growth pools total 100%.'}
                  </div>
                </div>
              )}
              {category.type === 'growth' && (
                <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Funds Upkeep</div>
                    <div className="small">Makes this pool silent — no more transactions here — and redirects its monthly distribution into Upkeep's Balance instead. Only one Growth pool can hold this at a time.</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={editFundsUpkeep} onChange={e => setEditFundsUpkeep(e.target.checked)} />
                    <span className="toggleTrack" />
                  </label>
                </div>
              )}
              {pipelineMode && (
                <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Start on Projects</div>
                    <div className="small">Tapping this card opens straight to its Projects tab instead of the amount-entry screen.</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={editStartOnProjects} onChange={e => setEditStartOnProjects(e.target.checked)} />
                    <span className="toggleTrack" />
                  </label>
                </div>
              )}
              {(category.type === 'allocation' || category.type === 'growth') && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Opening Balance (TZS)</div>
                  <input className="input" inputMode="decimal" value={editOpeningBalance} onChange={e => setEditOpeningBalance(e.target.value)} placeholder="e.g. 0" />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>One-time top-up added straight into Balance, for money this bucket already held before you started tracking it here — no need to backfill old transactions.</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn primary" style={{ flex: 1 }} disabled={growthOverBy > 0} onClick={() => {
                  const existingMeta = categoryMeta[metaType]?.[category.name]
                  const growthUpdate = category.type === 'growth'
                    ? withGrowthPercentForMonth(existingMeta, editMonthKey, Number(String(editPercent).replace(/,/g, '')) || 0)
                    : null
                  const budgetUpdate = category.type === 'allocation'
                    ? withBudgetForMonth(existingMeta, editMonthKey, Number(String(editBudget).replace(/,/g, '')) || 0)
                    : null
                  const nameChanged = editName !== category.name
                  const nextMetaForType = { ...(categoryMeta[metaType] || {}) }
                  if (nameChanged) delete nextMetaForType[category.name]
                  // Only one Growth pool may fund Upkeep at a time — clear the flag on
                  // every other pool in the same save so it stays exclusive.
                  if (category.type === 'growth' && editFundsUpkeep) {
                    for (const n of Object.keys(nextMetaForType)) {
                      if (n !== category.name && nextMetaForType[n]?.fundsUpkeep) {
                        nextMetaForType[n] = { ...nextMetaForType[n], fundsUpkeep: false }
                      }
                    }
                  }
                  const bookUpdate = {
                    categories: {
                      ...categories,
                      [metaType]: categories[metaType].map(n => n === category.name ? editName : n)
                    },
                    categoryMeta: {
                      ...categoryMeta,
                      [metaType]: {
                        ...nextMetaForType,
                        [editName]: {
                          ...(categoryMeta[metaType]?.[category.name] || {}),
                          color: editColor,
                          ...(pipelineMode && { startOnProjects: editStartOnProjects }),
                          ...(category.type === 'collection' && { needsCompliance: editNeedsCompliance }),
                          ...(category.type === 'expense' && { budget: Number(String(editBudget).replace(/,/g, '')) || 0 }),
                          ...(category.type === 'allocation' && { budgetHistory: budgetUpdate.budgetHistory }),
                          ...(category.type === 'growth' && { percentHistory: growthUpdate.percentHistory, fundsUpkeep: editFundsUpkeep }),
                          ...((category.type === 'allocation' || category.type === 'growth') && { openingBalance: Number(String(editOpeningBalance).replace(/,/g, '')) || 0 })
                        }
                      }
                    },
                    // Renaming a category orphaned its existing transactions (they kept the old
                    // category string and silently dropped out of every Balance/Spent total),
                    // making it look like the transactions had vanished. Re-point them here.
                    ...(nameChanged && {
                      txns: (txns || []).map(t =>
                        t.category === category.name && t.type === category.type ? { ...t, category: editName } : t
                      )
                    })
                  }
                  persistBook(bookUpdate)
                  setShowEditModal(false)
                  show('Card updated.')
                }}>Save Changes</button>
              </div>
              <button
                className="btn danger"
                style={{ width: '100%', marginTop: 4 }}
                onClick={() => {
                  const warn = total > 0
                    ? `Delete "${category.name}"? It has ${fmtTZS(total)} recorded — existing transactions are kept but will no longer show this card.`
                    : `Delete "${category.name}"? This can't be undone.`
                  if (!window.confirm(warn)) return
                  const nextMetaForType = { ...(categoryMeta[metaType] || {}) }
                  delete nextMetaForType[category.name]
                  const bookUpdate = {
                    categories: {
                      ...categories,
                      [metaType]: categories[metaType].filter(n => n !== category.name)
                    },
                    categoryMeta: { ...categoryMeta, [metaType]: nextMetaForType }
                  }
                  persistBook(bookUpdate)
                  setShowEditModal(false)
                  show('Card deleted.')
                  onClose()
                }}
              >Delete Category</button>
            </div>
          </div>
        </div>
      )}

      {effectiveShowAddForm ? (
        <div className="catDetailForm" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {logExpenseLabel && (
              <div style={{ textAlign: 'center', marginBottom: 8, padding: '6px 10px', borderRadius: 10, background: '#eef2ff', color: '#6366f1', fontSize: 11, fontWeight: 700 }}>
                Logging: {logExpenseLabel}
              </div>
            )}
            <div style={{ textAlign: 'center', margin: '0 0 10px', fontWeight: 700, color: '#111827', display: 'flex', flexDirection: 'column' }}>
              {prevValue && operator && <div style={{ fontSize: 16, color: '#6b7280', marginBottom: 2 }}>{formatCommas(prevValue)} {operator}</div>}
              <div style={{ fontSize: 28, color: '#111827', marginBottom: 2, fontWeight: 800 }}>TSh</div>
              <div style={{ fontSize: 35 }}>{formatCommas(amount || '0')}</div>
            </div>

            <div className="catDetailFormGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 10 }}>
                  <option value="">Account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div style={{ padding: '6px 4px', border: accountError ? '1px solid #f8a5a5' : '1px solid #eef2ff', background: accountId ? '#fef08a' : '#fff', borderRadius: 12, textAlign: 'center', fontSize: 11 }}>
                  <span style={{ fontSize: 16 }}>🏦</span> <br /> {accountId ? accounts.find(a => a.id === accountId)?.name : 'Account'}
                </div>
              </div>

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
                    onAddTxn(finalAmount, note, accountId, toAccountId, date, subAccountId, clientId, isRecurring ? { freq: recurringFreq, count: recurringCount } : null, pendingClient, true, logExpenseTarget);
                    setAmount(''); setNote(''); setPrevValue(''); setOperator(''); setShowAddForm(false); setLogExpenseTarget(null);
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
          {isSilentGrowth ? (
            <div style={{ width: '100%', marginBottom: 15, marginTop: 12, padding: '12px 14px', borderRadius: 12, background: '#f1f5f9', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              This pool funds Upkeep — add transactions there instead.
            </div>
          ) : (
            <button className="btn" style={{ width: '100%', marginBottom: 15, background: '#ffd76a', fontSize: 13, height: 44, marginTop: 12 }} onClick={() => { setLogExpenseTarget(null); setShowAddForm(true) }}>+ Add {category.name}</button>
          )}

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
            {pipelineMode && (
              <button
                onClick={() => setTxnTab('projects')}
                style={{
                  flex: 1, padding: '8px', borderRadius: 10,
                  background: txnTab === 'projects' ? '#fff' : 'transparent',
                  border: 'none', fontWeight: 700, fontSize: 12,
                  color: txnTab === 'projects' ? '#5a5fb0' : '#64748b',
                  boxShadow: txnTab === 'projects' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                }}
              >Projects</button>
            )}
          </div>

          {txnTab === 'projects' ? (
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', borderRadius: 16, background: '#eef2ff', marginBottom: 15
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: 0.3 }}>TOTAL PROJECTED</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{fmtTZS(totalProjected)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: shortfall > 0 ? '#ef4444' : '#10b981' }}>
                    {shortfall > 0
                      ? `Short by ${fmtTZS(shortfall)} against Balance`
                      : `Balance covers what's left to spend`}
                  </div>
                </div>
                <button className="btn primary" type="button" style={{ height: 36, fontSize: 12, padding: '0 14px' }} onClick={() => setShowAddProjectModal(true)}>+ Add Project</button>
              </div>

              {projectsWithTotals.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#64748b' }}>No projects yet for {category.name}.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {projectsWithTotals.map(p => {
                    const isExpanded = expandedProjectId === p.id
                    const pct = p.projected > 0 ? Math.min(100, Math.round((p.spent / p.projected) * 100)) : 0
                    const overBudget = p.spent > p.projected
                    return (
                      <div key={p.id} style={{ borderRadius: 16, background: '#fff', border: '0.5px solid #eef2ff', overflow: 'hidden' }}>
                        <div
                          onClick={() => setExpandedProjectId(isExpanded ? null : p.id)}
                          style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 16, background: '#fff', border: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0
                          }}>📁</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: overBudget ? '#ef4444' : '#94a3b8', marginTop: 2 }}>
                              {fmtTZS(p.spent)} / {fmtTZS(p.projected)}
                            </div>
                            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden', marginTop: 6 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: overBudget ? '#ef4444' : '#6366f1', borderRadius: 10 }} />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(p) }}
                            style={{ marginLeft: 4, opacity: 0.4, background: 'none', border: 'none', fontSize: 16 }}
                          >×</button>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {p.expenditures.length === 0 && (
                              <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 2px 8px' }}>No expenditures yet.</div>
                            )}
                            {p.expenditures.map(e => (
                              <div key={e.id} style={{
                                padding: '8px 10px', borderRadius: 12, background: '#f9fafb', border: '0.5px solid #f1f5f9',
                                display: 'flex', alignItems: 'center', gap: 10
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{e.name}</div>
                                  <div style={{ fontSize: 11, color: e.spent > e.amount ? '#ef4444' : '#94a3b8', marginTop: 1 }}>
                                    {fmtTZS(e.spent)} / {fmtTZS(e.amount)}
                                  </div>
                                </div>
                                {!isSilentGrowth && (
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ height: 30, fontSize: 11, padding: '0 10px', background: '#ffd76a' }}
                                    onClick={() => { setLogExpenseTarget({ projectId: p.id, expenditureId: e.id }); setShowAddForm(true) }}
                                  >Log Expense</button>
                                )}
                                <button type="button" onClick={() => handleDeleteExpenditure(p, e)} style={{ opacity: 0.4, background: 'none', border: 'none', fontSize: 16 }}>×</button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => { setAddExpenditureFor(p.id); setNewExpenditureName(''); setNewExpenditureAmount('') }}
                              style={{ alignSelf: 'flex-start', fontSize: 12, color: '#6366f1', fontWeight: 700, background: 'none', border: 'none', padding: '4px 2px' }}
                            >+ Add Expenditure</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
          <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{txnTab === 'activity' ? 'Recent' : 'Upcoming'} {category.name}</span>
            <button onClick={() => setIsSelectMode(!isSelectMode)} style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>{isSelectMode ? 'Cancel' : 'Select'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {groupedTxns.map(([d, items]) => {
              const dayDate = new Date(d)
              const totalOut = items.reduce((s, t) => s + (!isInflowRow(t) ? Number(t.amount || 0) : 0), 0)
              const totalIn = items.reduce((s, t) => s + (isInflowRow(t) ? Number(t.amount || 0) : 0), 0)
              return (
                <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 4px', borderBottom: '1px solid #f8fafc'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8' }}>{dayDate.getFullYear()}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>
                        {dayDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: totalOut > 0 ? '#ef4444' : '#10b981' }}>
                      {totalOut > 0 ? `OUT ${fmtCompact(totalOut)}` : `IN ${fmtCompact(totalIn)}`}
                    </div>
                  </div>
                  {items.map(t => (
                    <div key={t.id} className="catHistoryRow" onClick={() => { if (t._isTransfer) handleDeleteTransfer(t); else openTxnDetail(t) }} style={{
                      padding: '10px 12px',
                      borderRadius: 16,
                      background: t._isTransfer ? '#eef2ff' : '#fff',
                      border: t._isTransfer ? '0.5px dashed #c7d2fe' : '0.5px solid #eef2ff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      cursor: 'pointer'
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 16,
                        background: t._isTransfer ? '#e0e7ff' : '#fff', border: t._isTransfer ? '1px solid #c7d2fe' : '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: t._isTransfer ? 15 : 13, color: t._isTransfer ? '#6366f1' : '#64748b'
                      }}>
                        {t._isTransfer ? '⇄' : category.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="catHistoryInfo">
                        <div className="catHistoryTitleRow" style={{ fontSize: 13, fontWeight: 700, fontStyle: t._isTransfer ? 'italic' : 'normal' }}>{t.note || category.name}</div>
                        <div className="catHistoryMeta" style={{ fontSize: 11, textTransform: t._isTransfer ? 'uppercase' : 'none', letterSpacing: t._isTransfer ? 0.4 : 0 }}>
                          {t._isTransfer ? 'Bucket Transfer' : (t.accountId ? accounts.find(a => a.id === t.accountId)?.name : 'Unallocated')}
                        </div>
                        {t.reimbursedBy && t.reimbursedBy.length > 0 && (
                          <div className="reimbursedBadge" style={{ fontSize: 9, marginTop: 4 }}>
                            ✓ {fmtCompact(t.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))} Reimbursed
                          </div>
                        )}
                      </div>
                      <div className={`catHistoryAmount ${isInflowRow(t) ? 'pos' : 'neg'}`} style={{ fontSize: 14, fontWeight: 700 }}>
                        {isInflowRow(t) ? '+' : '-'}{fmtTZS(t.amount)}
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
          </>
          )}
        </div>
      )}

      {showReimburseModal && reimburseTxn && (
        <div className="modalBackdrop" onClick={() => setShowReimburseModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Reimburse</div>
            <div className="reimburseOriginal">
              <div className="reimburseOriginalLabel">Original Expense</div>
              <div className="reimburseOriginalInfo">
                <span>{reimburseTxn.note || reimburseTxn.category || 'Expense'}</span>
                <span className="reimburseOriginalAmt">{fmtTZS(reimburseTxn.amount)}</span>
              </div>
              {reimburseTxn.reimbursedBy && reimburseTxn.reimbursedBy.length > 0 && (
                <div className="reimburseAlready" style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Already reimbursed: {fmtTZS(reimburseTxn.reimbursedBy.reduce((s, r) => s + Number(r.amount || 0), 0))}
                </div>
              )}
            </div>
            <div className="accQuickForm" style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                  Reimbursement Amount (TZS) — Max: {fmtTZS(Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0))}
                </label>
                <input
                  inputMode="decimal"
                  value={reimburseAmount}
                  onChange={e => {
                    const max = Number(reimburseTxn.amount || 0) - (reimburseTxn.reimbursedBy || []).reduce((s, r) => s + Number(r.amount || 0), 0)
                    const val = Number(e.target.value.replace(/,/g, '') || 0)
                    if (val > max) setReimburseAmount(String(max))
                    else setReimburseAmount(e.target.value)
                  }}
                  className="input"
                  placeholder="e.g. 10000"
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Date</label>
                <input
                  type="date"
                  className="input"
                  value={reimburseDate}
                  onChange={e => setReimburseDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 600, color: reimburseError ? '#ef4444' : '#64748b' }}>
                  Receive Into Account {reimburseError ? '— Required' : ''}
                </label>
                <select
                  className="input"
                  value={reimburseAccountId}
                  onChange={e => { setReimburseAccountId(e.target.value); setReimburseError(false) }}
                  style={{ 
                    ...(reimburseError ? { borderColor: '#ef4444' } : {}),
                    appearance: 'auto',
                    paddingRight: '30px'
                  }}
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {showReimburseSubSelect && (
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Sub-account</label>
                  <select 
                    className="input" 
                    value={reimburseSubAccountId} 
                    onChange={e => setReimburseSubAccountId(e.target.value)}
                    style={{ appearance: 'auto', paddingRight: '30px' }}
                  >
                    <option value="">Select sub-account</option>
                    {reimburseAccount.subAccounts.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="pillBtn" type="button" onClick={() => setShowReimburseModal(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </button>
                <button
                  className="pillBtn primary"
                  type="button"
                  onClick={() => {
                    if (!reimburseAccountId) {
                      setReimburseError(true)
                      return
                    }
                    addReimbursement({
                      originalTxnId: reimburseTxn.id,
                      amount: reimburseAmount.replace(/,/g, ''),
                      accountId: reimburseAccountId,
                      subAccountId: reimburseSubAccountId,
                      date: reimburseDate
                    })
                    setReimburseError(false)
                    setShowReimburseModal(false)
                    setReimburseTxn(null)
                  }}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Save Reimbursement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddProjectModal && (
        <div className="modalBackdrop" onClick={() => setShowAddProjectModal(false)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Add Project</div>
            <div className="field">
              <label>Project Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Home Improvement"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modalActions">
              <button className="btn" type="button" onClick={() => setShowAddProjectModal(false)}>Cancel</button>
              <button className="btn primary" type="button" onClick={handleAddProject}>Add Project</button>
            </div>
          </div>
        </div>
      )}

      {addExpenditureFor && (
        <div className="modalBackdrop" onClick={() => setAddExpenditureFor(null)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <div className="modalTitle">Add Expenditure</div>
            <div className="field">
              <label>Expenditure Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Toilets (Tiles and Fundi's Costs)"
                value={newExpenditureName}
                onChange={e => setNewExpenditureName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Projected Cost (TZS)</label>
              <input
                inputMode="decimal"
                className="input"
                placeholder="e.g. 220,000"
                value={formatCommas(newExpenditureAmount)}
                onChange={e => setNewExpenditureAmount(e.target.value.replace(/,/g, ''))}
              />
            </div>
            <div className="modalActions">
              <button className="btn" type="button" onClick={() => setAddExpenditureFor(null)}>Cancel</button>
              <button className="btn primary" type="button" onClick={handleAddExpenditure}>Add Expenditure</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
