import React from 'react';

export function LedgerPicker({ 
  showLedgerPicker, 
  setShowLedgerPicker, 
  ledgers, 
  activeLedger, 
  handleSelectLedger, 
  handleAddPersonalLedger, 
  handleAddBusinessLedger 
}) {
  if (!showLedgerPicker) return null;

  return (
    <div className="ledgerPickerBackdrop" onClick={() => setShowLedgerPicker(false)}>
      <div className="ledgerPickerCard" onClick={e => e.stopPropagation()}>
        <div className="ledgerPickerTitle">Ledgers</div>
        <div className="ledgerPickerList">
          {ledgers.map(l => (
            <button 
              key={l.id} 
              className={`ledgerPickerItem ${l.id === activeLedger.id ? 'active' : ''}`} 
              onClick={() => handleSelectLedger(l.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className={`ledgerIcon ${l.type === 'business' ? 'biz' : 'pers'}`}>
                  {l.type === 'business' ? '🏢' : '👤'}
                </div>
                <span>{l.name}</span>
              </div>
              {l.id === activeLedger.id && <span className="ledgerCheck">✓</span>}
            </button>
          ))}
        </div>
        <div className="ledgerPickerFooter">
          <button className="ledgerAddBtn" onClick={handleAddPersonalLedger}>+ Personal</button>
          <button className="ledgerAddBtn" onClick={handleAddBusinessLedger}>+ Business</button>
        </div>
      </div>
    </div>
  );
}
