import React, { useState } from 'react'
import { useAppContext } from '../context/AppContext'

const INSIGHT_TAB_LABELS = { transactions: 'Transactions', summary: 'Summary', cashflow: 'Cashflow' }
const APP_TAB_LABELS = { insights: 'Insights', tx: 'Transactions', accounts: 'Accounts', settings: 'Settings' }

export default function VisibilitySettings({ onClose }) {
  const { vault, settings, updateSettings, persist, show } = useAppContext()
  const [insightTabOrder, setInsightTabOrder] = useState(settings.insightTabOrder || ['transactions', 'summary', 'cashflow'])
  const [appTabOrder, setAppTabOrder] = useState(settings.appTabOrder || ['insights', 'tx', 'accounts', 'settings'])
  const [defaultTab, setDefaultTab] = useState(settings.defaultAppTab || 'tx')
  const [defaultInsightTab, setDefaultInsightTab] = useState(settings.defaultInsightTab || 'summary')

  function moveInsight(index, delta) {
    const newOrder = [...insightTabOrder]
    const target = index + delta
    if (target >= 0 && target < newOrder.length) {
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
      setInsightTabOrder(newOrder)
    }
  }

  function moveAppTab(index, delta) {
    const newOrder = [...appTabOrder]
    const target = index + delta
    if (target >= 0 && target < newOrder.length) {
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
      setAppTabOrder(newOrder)
    }
  }

  function handleSave() {
    persist({
      ...vault,
      settings: {
        ...vault.settings,
        defaultAppTab: defaultTab,
        defaultInsightTab: defaultInsightTab,
        insightTabOrder: insightTabOrder,
        appTabOrder: appTabOrder
      }
    })
    onClose()
    show('Visibility settings saved.')
  }

  const tabLabels = { ...INSIGHT_TAB_LABELS, ...APP_TAB_LABELS }

  return (
    <div className="subPageOverlay">
      <div className="subPageHeader">
        <button className="backBtn" onClick={onClose}>←</button>
        <h1 className="subPageTitle">Visibility Settings</h1>
      </div>
      <div className="subPageBody">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
           <div className="card" style={{ margin: 0 }}>
             <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>App Tab Order</div>
             {appTabOrder.map((id, i) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i === appTabOrder.length -1 ? 'none' : '1px solid #f1f5f9' }}>
                  <button onClick={() => setDefaultTab(id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0 }}>
                    <div style={{ fontWeight: defaultTab === id ? 700 : 400 }}>{tabLabels[id]} {defaultTab === id && '✓'}</div>
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="iconBtn" onClick={() => moveAppTab(i, -1)} disabled={i === 0}>↑</button>
                    <button className="iconBtn" onClick={() => moveAppTab(i, 1)} disabled={i === appTabOrder.length - 1}>↓</button>
                  </div>
                </div>
             ))}
           </div>
           
           <div className="card" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Insight Tab Order</div>
              {insightTabOrder.map((id, i) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i === insightTabOrder.length -1 ? 'none' : '1px solid #f1f5f9' }}>
                   <button onClick={() => setDefaultInsightTab(id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0 }}>
                    <div style={{ fontWeight: defaultInsightTab === id ? 700 : 400 }}>{tabLabels[id]} {defaultInsightTab === id && '✓'}</div>
                  </button>
                   <div style={{ display: 'flex', gap: 6 }}>
                    <button className="iconBtn" onClick={() => moveInsight(i, -1)} disabled={i === 0}>↑</button>
                    <button className="iconBtn" onClick={() => moveInsight(i, 1)} disabled={i === insightTabOrder.length - 1}>↓</button>
                  </div>
                </div>
              ))}
           </div>
           
           <button className="btn primary" onClick={handleSave}>Save Visibility Settings</button>
        </div>
      </div>
    </div>
  )
}
