import React from 'react'
import { CHANGELOG } from '../changelog'

export default function ChangelogScreen({ onClose }) {
  return (
    <div className="subPageOverlay">
      <div className="subPageHeader">
        <button className="backBtn" onClick={onClose}>←</button>
        <h1 className="subPageTitle">What's New</h1>
      </div>
      <div className="subPageBody" style={{ paddingBottom: 40 }}>
        {CHANGELOG.map((entry, i) => (
          <div key={i} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e1b4b' }}>v{entry.version}</div>
              <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{entry.date}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entry.changes.map((change, j) => (
                <div key={j} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ color: '#6366f1' }}>•</div>
                  <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }}>{change}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
