import React from 'react'

export default function BottomNav({ tab, setTab, variant }) {
  const isLight = variant === 'light'
  // Colors from the user's screenshot
  const activeColor = '#5a5fb0' 
  const inactiveColor = '#9aa0bf' 

  const icons = [
    {
      id: 'insights',
      label: 'Insights',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* 3 sloping bars as seen in screenshot */}
          <rect x="4" y="14" width="4" height="6" rx="1.5" fill={active ? "#f97316" : "#f97316"} />
          <rect x="10" y="10" width="4" height="10" rx="1.5" fill={active ? "#f97316" : "#f97316"} />
          <rect x="16" y="6" width="4" height="14" rx="1.5" fill={active ? "#f97316" : "#f97316"} />
        </svg>
      )
    },
    {
      id: 'tx',
      label: 'Transactions',
      content: (active) => (
        <span style={{ fontSize: 28, filter: active ? 'none' : 'grayscale(0.4)' }}>📄</span>
      )
    },
    {
      id: 'accounts',
      label: 'Accounts',
      content: (active) => (
        <span style={{ fontSize: 24, filter: active ? 'none' : 'grayscale(0.4)' }}>💳</span>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      content: (active) => (
        <span style={{ fontSize: 24, filter: active ? 'none' : 'grayscale(0.8)' }}>⚙️</span>
      )
    }
  ]

  return (
    <div className={`bottomNav ${isLight ? 'light' : ''}`} style={{ borderTop: '1px solid #f1f1f4' }}>
      {icons.map(icon => (
        <button 
          key={icon.id}
          className={`navItem ${tab === icon.id ? 'active' : ''}`}
          onClick={() => setTab(icon.id)}
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '10px 0'
          }}
        >
          <div className="navIcon" style={{ marginBottom: 4 }}>
            {icon.content(tab === icon.id)}
          </div>
          <div className="navLabel" style={{ 
            fontSize: 13, 
            fontWeight: 500, 
            color: tab === icon.id ? activeColor : inactiveColor 
          }}>
            {icon.label}
          </div>
        </button>
      ))}
    </div>
  )
}
