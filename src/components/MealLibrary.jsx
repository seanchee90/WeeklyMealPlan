import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const EMPTY = { name: '', type: 'puree', has_protein: false, has_veggie: false, servings_available: 0 }

export default function MealLibrary() {
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchMeals() }, [])

  async function fetchMeals() {
    setLoading(true)
    const { data, error } = await supabase.from('meals').select('*').order('type').order('name')
    if (!error) setMeals(data)
    setLoading(false)
  }

  // FIX 4: update local state directly, no refetch
  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    if (editId) {
      const { error } = await supabase.from('meals').update(form).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
      setMeals(ms => ms.map(m => m.id === editId ? { ...m, ...form } : m))
    } else {
      const { data, error } = await supabase.from('meals').insert(form).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      setMeals(ms => [...ms, data].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)))
    }
    setSaving(false)
    setForm(EMPTY)
    setEditId(null)
    setShowForm(false)
  }

  // FIX 5: update local state directly, no refetch
  async function updateServings(id, delta) {
    const meal = meals.find(m => m.id === id)
    const next = Math.max(0, meal.servings_available + delta)
    setMeals(ms => ms.map(m => m.id === id ? { ...m, servings_available: next } : m))
    await supabase.from('meals').update({ servings_available: next }).eq('id', id)
  }

  // FIX 6: update local state directly, no refetch
  async function deleteMeal(id) {
    if (!confirm('Delete this meal?')) return
    setMeals(ms => ms.filter(m => m.id !== id))
    await supabase.from('meals').delete().eq('id', id)
  }

  function startEdit(meal) {
    setForm({ name: meal.name, type: meal.type, has_protein: meal.has_protein, has_veggie: meal.has_veggie, servings_available: meal.servings_available })
    setEditId(meal.id)
    setShowForm(true)
  }

  function cancel() {
    setForm(EMPTY)
    setEditId(null)
    setShowForm(false)
    setError(null)
  }

  const purées = meals.filter(m => m.type === 'puree')
  const fingers = meals.filter(m => m.type === 'finger_food')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'normal' }}>Meal library</h2>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Add meal</button>
        )}
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <p className="section-title" style={{ marginBottom: '1rem' }}>{editId ? 'Edit meal' : 'New meal'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <label>Meal name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sweet potato puree" />
            </div>
            <div>
              <label>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="puree">Puree</option>
                <option value="finger_food">Finger food</option>
              </select>
            </div>
            <div>
              <label>Current servings available</label>
              <input type="number" min="0" value={form.servings_available} onChange={e => setForm(f => ({ ...f, servings_available: parseInt(e.target.value) || 0 }))} />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.has_protein} onChange={e => setForm(f => ({ ...f, has_protein: e.target.checked }))} />
                Has protein
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.has_veggie} onChange={e => setForm(f => ({ ...f, has_veggie: e.target.checked }))} />
                Has veggie
              </label>
            </div>
            {error && <div className="flag flag-error">{error}</div>}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save meal'}</button>
              <button className="btn" onClick={cancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="spinner">Loading meals…</div>
      ) : meals.length === 0 ? (
        <div className="empty-state">No meals yet. Add your first one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[['Purées', purées, 'puree'], ['Finger foods', fingers, 'finger_food']].map(([label, list, type]) => (
            <div key={type}>
              <p className="section-title">{label} ({list.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {list.length === 0 ? (
                  <div className="card" style={{ color: 'var(--ink-faint)', fontFamily: 'sans-serif', fontSize: '0.85rem' }}>None added yet</div>
                ) : list.map(meal => (
                  <div key={meal.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem 0.625rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.9rem', fontWeight: 500 }}>{meal.name}</span>
                        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                          <button className="btn btn-sm" onClick={() => startEdit(meal)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteMeal(meal.id)}>Delete</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {meal.has_protein && <span className="pill pill-ok">protein</span>}
                        {meal.has_veggie && <span className="pill pill-ok">veggie</span>}
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--cream)' }}>
                      <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Servings</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                        <button className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', lineHeight: 1 }} onClick={() => updateServings(meal.id, -1)}>−</button>
                        <span style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.9rem', fontWeight: 600, minWidth: '1.5rem', textAlign: 'center' }}>{meal.servings_available}</span>
                        <button className="btn btn-sm" style={{ padding: '0.3rem 0.6rem', lineHeight: 1 }} onClick={() => updateServings(meal.id, 1)}>+</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
