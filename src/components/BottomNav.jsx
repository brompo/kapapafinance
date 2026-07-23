import React from 'react'
import { useAppContext } from '../context/AppContext'

export default function BottomNav({ tab, setTab, variant }) {
  const { settings, activeLedger } = useAppContext()
  const isLight = variant === 'light'
  const activeColor = '#5a5fb0'
  const inactiveColor = '#9aa0bf'

  // One consistent flat line-icon style across every tab — single-color stroke,
  // no fill, no emoji — only the active/inactive color differs.
  const icons = [
    {
      id: 'insights',
      label: 'Insights',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 20V13M12 20V9M18 20V5" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      id: 'tx',
      label: 'Transactions',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinejoin="round"/>
          <path d="M9 10h6M9 14h6M9 18h3" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      id: 'flow',
      label: 'Flow',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 9c1.4 0 1.4-3 2.8-3s1.4 3 2.8 3 1.4-3 2.8-3 1.4 3 2.8 3 1.4-3 2.8-3 1.4 3 2.8 3 1.4-3 2.8-3" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 15c1.4 0 1.4-3 2.8-3s1.4 3 2.8 3 1.4-3 2.8-3 1.4 3 2.8 3 1.4-3 2.8-3 1.4 3 2.8 3 1.4-3 2.8-3" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      id: 'accounts',
      label: 'Accounts',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="6" width="18" height="13" rx="2" stroke={active ? activeColor : inactiveColor} strokeWidth="2"/>
          <path d="M3 10.5h18" stroke={active ? activeColor : inactiveColor} strokeWidth="2"/>
          <path d="M6.5 15h4" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      id: 'dse',
      label: 'DSE',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 17L9 11L13 15L21 7" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M17 7H21V11" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      content: (active) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="3" stroke={active ? activeColor : inactiveColor} strokeWidth="2"/>
          <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke={active ? activeColor : inactiveColor} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )
    }
  ]

  const pipelineMode = activeLedger.type === 'personal' && settings.moneyPipelineEnabled
  const visibleIcons = icons.filter(i => {
    if (i.id === 'dse') return settings.dseEnabled
    if (i.id === 'flow') return pipelineMode
    // Flow takes over Transactions' job as the primary tab for pipeline mode —
    // Transactions is still fully there, just reached via Settings instead of
    // taking a bottom-nav slot (see SettingsScreen's Transactions row).
    if (i.id === 'tx') return !pipelineMode
    return true
  })

  return (
    <div className={`bottomNav ${isLight ? 'light' : ''}`} style={{ borderTop: '1px solid #f1f1f4' }}>
      {visibleIcons.map(icon => (
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
