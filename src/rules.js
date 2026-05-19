const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const SLOTS = ['lunch','dinner']

export function generatePlan(meals) {
  const purées = meals.filter(m => m.type === 'puree' && m.servings_available > 0)
  const fingers = meals.filter(m => m.type === 'finger_food' && m.servings_available > 0)

  // Internal serving counter for generation only — DB deduction happens on confirm
  const servings = {}
  meals.forEach(m => { servings[m.id] = m.servings_available })

  const slots = []
  const flags = []
  // Track last two combos to avoid repeating on consecutive slots (including across day boundaries)
  const recentCombos = []

  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const availPurées = purées.filter(m => servings[m.id] > 0)
      const availFingers = fingers.filter(m => servings[m.id] > 0)

      if (availPurées.length === 0) {
        flags.push({ type: 'no_puree', day, slot })
        slots.push({ day, meal_slot: slot, puree_meal_id: null, finger_food_meal_id: null })
        continue
      }
      if (availFingers.length === 0) {
        flags.push({ type: 'no_finger_food', day, slot })
        slots.push({ day, meal_slot: slot, puree_meal_id: null, finger_food_meal_id: null })
        continue
      }

      // Find a combo not used in the last two slots
      const isRecentCombo = (p, f) => recentCombos.some(c => c.pureeId === p.id && c.fingerId === f.id)
      let puree = availPurées[0]
      let finger = availFingers[0]
      let found = false
      for (const p of availPurées) {
        for (const f of availFingers) {
          if (!isRecentCombo(p, f)) { puree = p; finger = f; found = true; break }
        }
        if (found) break
      }

      // Track recent combos (keep last 2)
      recentCombos.push({ pureeId: puree.id, fingerId: finger.id })
      if (recentCombos.length > 2) recentCombos.shift()

      // Nutrition rule: slot must have at least one meal with protein and one with veggie (can be same meal)
      const slotHasProtein = puree.has_protein || finger.has_protein
      const slotHasVeggie = puree.has_veggie || finger.has_veggie
      if (!slotHasProtein)
        flags.push({ type: 'slot_missing_protein', day, slot })
      if (!slotHasVeggie)
        flags.push({ type: 'slot_missing_veggie', day, slot })

      servings[puree.id]--
      servings[finger.id]--

      slots.push({ day, meal_slot: slot, puree_meal_id: puree.id, finger_food_meal_id: finger.id })
    }
  }

  return { slots, flags }
}

export function validateSlots(slots, meals) {
  const mealMap = Object.fromEntries(meals.map(m => [m.id, m]))
  const flags = []

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    const puree = mealMap[s.puree_meal_id]
    const finger = mealMap[s.finger_food_meal_id]

    if (!puree) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing puree' }); continue }
    if (!finger) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing finger food' }); continue }

    // Nutrition: slot needs protein covered and veggie covered across both meals
    const slotHasProtein = puree.has_protein || finger.has_protein
    const slotHasVeggie = puree.has_veggie || finger.has_veggie
    if (!slotHasProtein)
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'No protein in this slot — at least one meal must have protein' })
    if (!slotHasVeggie)
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'No veggie in this slot — at least one meal must have veggie' })

    // Combo repeat: check against last two slots
    const prev1 = slots[i - 1]
    const prev2 = slots[i - 2]
    const sameAsPrev = (prev) => prev && prev.puree_meal_id === s.puree_meal_id && prev.finger_food_meal_id === s.finger_food_meal_id
    if (sameAsPrev(prev1) || sameAsPrev(prev2))
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'Same combo used in the last two meals' })
  }

  return flags
}

export function deductServings(slots, meals) {
  const counts = {}
  slots.forEach(s => {
    if (s.puree_meal_id) counts[s.puree_meal_id] = (counts[s.puree_meal_id] || 0) + 1
    if (s.finger_food_meal_id) counts[s.finger_food_meal_id] = (counts[s.finger_food_meal_id] || 0) + 1
  })
  return meals.map(m => ({
    ...m,
    servings_available: Math.max(0, m.servings_available - (counts[m.id] || 0))
  }))
}
