import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { GlobalToast } from '../components/GlobalToast'

export function PinStage({ mode }) {
  const { handleSetPin, pin, setPin, pin2, setPin2 } = useAppContext()

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pinWrap card">
        <div className="brand">
          <span className="dot" />
          <div>
            <div className="title">Kapapa Finance</div>
            <div className="subtitle">Private, offline-first finance tracker</div>
          </div>
        </div>
        <div className="hr" />
        <div className="pinTitle">{mode === 'confirm' ? 'Confirm PIN' : 'Set your PIN'}</div>
        <div className="pinHint">
          Your data is stored only on this device/browser and is encrypted using your PIN.
          If you forget the PIN, there is no recovery (you can only reset).
        </div>

        {mode === 'set' ? (
          <div className="field">
            <label htmlFor="kapapa-pin-1">New PIN (min 4 characters)</label>
            <input type="password" id="kapapa-pin-1" name="kapapa-pin-1" value={pin} onChange={e => setPin(e.target.value)} placeholder="e.g. 1234" autoFocus autoComplete="new-password" />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="kapapa-pin-2">Confirm PIN</label>
            <input type="password" id="kapapa-pin-2" name="kapapa-pin-2" value={pin2} onChange={e => setPin2(e.target.value)} placeholder="repeat PIN" autoFocus autoComplete="new-password" />
          </div>
        )}

        <button className="btn primary" onClick={handleSetPin} style={{ width: '100%', marginTop: 12 }}>
          {mode === 'set' ? 'Next' : 'Create Vault'}
        </button>

        <div className="small" style={{ marginTop: 20, textAlign: 'center' }}>
          Tip: Use iPhone Face ID/Passcode + a PIN you can remember.
        </div>
      </div>
      <GlobalToast />
    </div>
  )
}

export function UnlockStage() {
  const { pin, setPin, handleUnlock, handleReset } = useAppContext()

  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pinWrap card">
        <div className="brand">
          <span className="dot" />
          <div>
            <div className="title">Kapapa Finance</div>
            <div className="subtitle">Enter PIN to unlock</div>
          </div>
        </div>
        <div className="hr" />
        <div className="field">
          <label htmlFor="kapapa-unlock-pin">PIN</label>
          <input type="password" id="kapapa-unlock-pin" name="kapapa-unlock-pin" value={pin} onChange={e => setPin(e.target.value)} placeholder="Your PIN" autoFocus autoComplete="current-password" />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={handleUnlock} style={{ flex: 1 }}>Unlock</button>
          <button className="btn danger" onClick={handleReset} style={{ flex: 1 }}>Reset</button>
        </div>
        <div className="small" style={{ marginTop: 20, textAlign: 'center' }}>
          Export/import is available after unlock (recommended).
        </div>
      </div>
      <GlobalToast />
    </div>
  )
}

export function LandingStage() {
  const { setStage } = useAppContext()
  return (
    <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="pinWrap card" style={{ textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <span className="dot" />
          <div style={{ textAlign: 'left' }}>
            <div className="title" style={{ fontSize: 24 }}>Kapapa Finance</div>
            <div className="subtitle">Secure Wealth Tracking</div>
          </div>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
          Private, encrypted, and designed for speed. Take control of your financial journey.
        </p>
        <button className="btn primary" onClick={() => setStage('setpin')} style={{ width: '100%', padding: 15, fontSize: 16 }}>
          Get Started
        </button>
      </div>
    </div>
  )
}
