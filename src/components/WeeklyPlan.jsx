import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { generatePlan, validateSlots, deductServings } from '../rules'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const SLOTS = ['lunch','dinner']

function getMondayStr() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function dayLabel(mondayStr, index) {
  const d = new Date(mondayStr + 'T00:00:00')
  d.setDate(d.getDate() + index)
  return DAYS[index] + ' ' + ordinal(d.getDate()) + ' ' + d.toLocaleDateString('en-AU', { month: 'long' })
}

function getTodayName() {
  return new Date().toLocaleDateString('en-AU', { weekday: 'long' })
}

function isMidWeek() {
  const day = new Date().getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  return day !== 1 // not Monday
}

export default function WeeklyPlan() {
  const [meals, setMeals] = useState([])
  const [plan, setPlan] = useState(null)
  const [slots, setSlots] = useState([])
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(null)
  const mondayStr = getMondayStr()
  const todayName = getTodayName()
  const todayIndex = DAYS.indexOf(todayName)
  const midWeek = isMidWeek()

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const [{ data: mealData }, { data: planData }, { data: allSlotData }] = await Promise.all([
      supabase.from('meals').select('*'),
      supabase.from('weekly_plans').select('*').eq('week_starting', mondayStr).single(),
      supabase.from('plan_slots').select('*')
    ])
    setMeals(mealData || [])
    if (planData) {
      setPlan(planData)
      const s = (allSlotData || []).filter(s => s.plan_id === planData.id)
      setSlots(s)
      setFlags(validateSlots(s, mealData || []))
    }
    setLoading(false)
  }

  async function generate() {
    setGenerating(true)
    const { slots: newSlots, flags: newFlags } = generatePlan(meals)

    let planId = plan?.id
    if (!planId) {
      const { data } = await supabase.from('weekly_plans').insert({ week_starting: mondayStr, status: 'draft' }).select().single()
      planId = data.id
    } else {
      await Promise.all([
        supabase.from('weekly_plans').update({ status: 'draft' }).eq('id', planId),
        supabase.from('plan_slots').delete().eq('plan_id', planId)
      ])
    }

    const rows = newSlots.map(s => ({ ...s, plan_id: planId }))
    await supabase.from('plan_slots').insert(rows)

    setPlan({ id: planId, week_starting: mondayStr, status: 'draft' })
    setSlots(rows)
    setFlags([...newFlags, ...validateSlots(rows, meals)])
    setGenerating(false)
  }

  async function confirmPlan() {
    if (!window.confirm('Confirm this plan? Servings will be deducted from your meal library.')) return
    setConfirming(true)

    const updated = deductServings(slots, meals)
    await Promise.all([
      supabase.from('meals').upsert(updated),
      supabase.from('weekly_plans').update({ status: 'confirmed' }).eq('id', plan.id)
    ])

    setPlan(p => ({ ...p, status: 'confirmed' }))
    setMeals(updated)
    setConfirming(false)
  }

  async function swapMeal(day, meal_slot, field, newMealId) {
    const updated = slots.map(s => {
      if (s.day === day && s.meal_slot === meal_slot) return { ...s, [field]: newMealId }
      return s
    })
    setSlots(updated)
    setFlags(validateSlots(updated, meals))
    setEditing(null)

    await supabase.from('plan_slots')
      .update({ [field]: newMealId })
      .eq('plan_id', plan.id).eq('day', day).eq('meal_slot', meal_slot)
  }

  function getSlot(day, meal_slot) {
    return slots.find(s => s.day === day && s.meal_slot === meal_slot)
  }

  function getMeal(id) {
    return meals.find(m => m.id === id)
  }

  function getFlagsFor(day, meal_slot) {
    return flags.filter(f => f.day === day && f.slot === meal_slot)
  }

  const purées = meals.filter(m => m.type === 'puree')
  const fingers = meals.filter(m => m.type === 'finger_food')

  // Regenerate is disabled mid-week when a plan already exists
  const regenDisabled = generating || meals.length === 0 || (midWeek && !!plan)

  if (loading) return <div className="spinner">Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'normal' }}>Week of {new Date(mondayStr + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}</h2>
          {plan && (
            <span className={`pill ${plan.status === 'confirmed' ? 'pill-ok' : 'pill-warn'}`} style={{ marginTop: '0.3rem', display: 'inline-block' }}>
              {plan.status === 'confirmed' ? '✓ Confirmed' : 'Draft'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-accent" onClick={generate} disabled={regenDisabled}>
              {generating ? 'Generating…' : plan ? 'Regenerate' : 'Generate plan'}
            </button>
            {plan && plan.status === 'draft' && slots.length > 0 && (
              <button className="btn btn-primary" onClick={confirmPlan} disabled={confirming}>
                {confirming ? 'Confirming…' : 'Confirm plan'}
              </button>
            )}
          </div>
          {midWeek && plan && (
            <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.72rem', color: 'var(--ink-faint)', textAlign: 'right' }}>
              Mid-week — edit meals directly instead
            </p>
          )}
        </div>
      </div>

      {/* Confirmed plan edit warning */}
      {plan && plan.status === 'confirmed' && (
        <div className="flag flag-warn" style={{ marginBottom: '1rem' }}>
          Plan confirmed — you can still edit meals but servings won't auto-adjust. Update the meal library manually if needed.
        </div>
      )}

      {meals.length === 0 && (
        <div className="flag flag-warn" style={{ marginBottom: '1rem' }}>
          No meals in library. Go to Meal library and add some meals first.
        </div>
      )}

      {flags.filter(f => f.type === 'no_puree' || f.type === 'no_finger_food').length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
          <p className="section-title">Stock issues</p>
          {flags.filter(f => f.type === 'no_puree' || f.type === 'no_finger_food').map((f, i) => (
            <div key={i} className="flag flag-error">
              ⚠ {f.day} {f.slot} — {f.type === 'no_puree' ? 'No purées available' : 'No finger foods available'}. Cook more and update the meal library.
            </div>
          ))}
        </div>
      )}

      {!plan ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '1rem', color: 'var(--ink)', marginBottom: '0.5rem', fontWeight: 500 }}>
            This week's meal plan hasn't been set up yet
          </p>
          <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
            Tap Generate plan above to get started
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {DAYS.map((day, i) => {
            const isToday = day === todayName
            const isPast = i < todayIndex
            const canEdit = !isPast

            return (
              <div
                key={day}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  outline: isToday ? '2px solid var(--accent)' : 'none',
                  opacity: isPast ? 0.45 : 1
                }}
              >
                <div style={{
                  background: isToday ? 'var(--accent)' : 'var(--ink)',
                  color: '#fff',
                  padding: '0.45rem 1rem',
                  fontFamily: '-apple-system, sans-serif',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>{isToday && '▸ '}{dayLabel(mondayStr, i)}</span>
                  {isPast && <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 400 }}>past</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {SLOTS.map((slot, si) => {
                    const s = getSlot(day, slot)
                    const puree = s ? getMeal(s.puree_meal_id) : null
                    const finger = s ? getMeal(s.finger_food_meal_id) : null
                    const slotFlags = getFlagsFor(day, slot)
                    const isEditingPuree = editing?.day === day && editing?.slot === slot && editing?.field === 'puree_meal_id'
                    const isEditingFinger = editing?.day === day && editing?.slot === slot && editing?.field === 'finger_food_meal_id'

                    return (
                      <div key={slot} style={{ padding: '0.75rem 1rem', borderLeft: si === 1 ? '1px solid var(--border)' : 'none' }}>
                        <p style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '0.5rem' }}>{slot}</p>

                        <div style={{ marginBottom: '0.5rem' }}>
                          <span className="pill pill-puree" style={{ marginBottom: '0.3rem', display: 'inline-block' }}>Puree</span>
                          {isEditingPuree ? (
                            <select autoFocus style={{ marginTop: '0.25rem' }} value={s?.puree_meal_id || ''} onChange={e => swapMeal(day, slot, 'puree_meal_id', e.target.value || null)} onBlur={() => setEditing(null)}>
                              <option value="">— none —</option>
                              {purées.map(m => <option key={m.id} value={m.id}>{m.name} ({m.servings_available} left)</option>)}
                            </select>
                          ) : (
                            <p
                              style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.82rem', color: puree ? 'var(--ink)' : 'var(--ink-faint)', cursor: canEdit ? 'pointer' : 'default', fontStyle: puree ? 'normal' : 'italic' }}
                              onClick={() => canEdit && setEditing({ day, slot, field: 'puree_meal_id' })}
                            >
                              {puree ? puree.name : 'Not set'}{canEdit && ' ✎'}
                            </p>
                          )}
                        </div>

                        <div>
                          <span className="pill pill-finger" style={{ marginBottom: '0.3rem', display: 'inline-block' }}>Finger food</span>
                          {isEditingFinger ? (
                            <select autoFocus style={{ marginTop: '0.25rem' }} value={s?.finger_food_meal_id || ''} onChange={e => swapMeal(day, slot, 'finger_food_meal_id', e.target.value || null)} onBlur={() => setEditing(null)}>
                              <option value="">— none —</option>
                              {fingers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.servings_available} left)</option>)}
                            </select>
                          ) : (
                            <p
                              style={{ fontFamily: '-apple-system, sans-serif', fontSize: '0.82rem', color: finger ? 'var(--ink)' : 'var(--ink-faint)', cursor: canEdit ? 'pointer' : 'default', fontStyle: finger ? 'normal' : 'italic' }}
                              onClick={() => canEdit && setEditing({ day, slot, field: 'finger_food_meal_id' })}
                            >
                              {finger ? finger.name : 'Not set'}{canEdit && ' ✎'}
                            </p>
                          )}
                        </div>

                        {slotFlags.filter(f => f.msg).map((f, fi) => (
                          <div key={fi} className="flag flag-warn" style={{ marginTop: '0.5rem', fontSize: '0.72rem', padding: '0.35rem 0.6rem' }}>⚠ {f.msg}</div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
