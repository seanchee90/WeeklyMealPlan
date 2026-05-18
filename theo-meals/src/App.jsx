import { useState } from 'react'
import MealLibrary from './components/MealLibrary'
import WeeklyPlan from './components/WeeklyPlan'
import './app.css'

export default function App() {
  const [view, setView] = useState('plan')

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-emoji">🥣</span>
            <div>
              <h1>Theo's meals</h1>
              <p className="logo-sub">Weekly meal planner</p>
            </div>
          </div>
          <nav className="nav">
            <button className={view === 'plan' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('plan')}>
              This week
            </button>
            <button className={view === 'library' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('library')}>
              Meal library
            </button>
          </nav>
        </div>
      </header>
      <main className="main">
        {view === 'plan' ? <WeeklyPlan /> : <MealLibrary />}
      </main>
    </div>
  )
}
