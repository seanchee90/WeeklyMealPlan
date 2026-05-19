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

  for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
    const day = DAYS[dayIndex]

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

      // Collect puree and finger food IDs used today and yesterday
      const recentSlots = slots.filter(s => {
        const sDay = DAYS.indexOf(s.day)
        return sDay === dayIndex || sDay === dayIndex - 1
      })
      const recentPureeIds = new Set(recentSlots.map(s => s.puree_meal_id).filter(Boolean))
      const recentFingerIds = new Set(recentSlots.map(s => s.finger_food_meal_id).filter(Boolean))

      // Also track last 2 combos for combo-repeat rule
      const lastTwo = slots.slice(-2)
      const isRecentCombo = (p, f) => lastTwo.some(s => s.puree_meal_id === p.id && s.finger_food_meal_id === f.id)

      // Preferred: puree not used today/yesterday, finger not used today/yesterday, combo not repeated
      // Fall back progressively if not enough variety
      const preferredPurées = availPurées.filter(m => !recentPureeIds.has(m.id))
      const preferredFingers = availFingers.filter(m => !recentFingerIds.has(m.id))

      let puree = null
      let finger = null
      let found = false

      // Try preferred pools first
      for (const p of (preferredPurées.length ? preferredPurées : availPurées)) {
        for (const f of (preferredFingers.length ? preferredFingers : availFingers)) {
          if (!isRecentCombo(p, f)) { puree = p; finger = f; found = true; break }
        }
        if (found) break
      }

      // Fallback 1: relax combo rule, keep meal freshness
      if (!found) {
        puree = preferredPurées[0] || availPurées[0]
        finger = preferredFingers[0] || availFingers[0]
        found = true
      }

      // Nutrition rule: slot must have protein and veggie covered across both meals
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
    const dayIndex = DAYS.indexOf(s.day)
    const puree = mealMap[s.puree_meal_id]
    const finger = mealMap[s.finger_food_meal_id]

    if (!puree) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing puree' }); continue }
    if (!finger) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing finger food' }); continue }

    // Nutrition: slot needs protein and veggie covered across both meals
    const slotHasProtein = puree.has_protein || finger.has_protein
    const slotHasVeggie = puree.has_veggie || finger.has_veggie
    if (!slotHasProtein)
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'No protein in this slot — at least one meal must have protein' })
    if (!slotHasVeggie)
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'No veggie in this slot — at least one meal must have veggie' })

    // Check if same puree or finger food used today or yesterday
    const recentSlots = slots.filter((rs, ri) => {
      const rDay = DAYS.indexOf(rs.day)
      return ri !== i && (rDay === dayIndex || rDay === dayIndex - 1)
    })
    const recentPureeIds = new Set(recentSlots.map(s => s.puree_meal_id))
    const recentFingerIds = new Set(recentSlots.map(s => s.finger_food_meal_id))

    if (recentPureeIds.has(s.puree_meal_id))
      flags.push({ day: s.day, slot: s.meal_slot, msg: `${puree.name} was already used today or yesterday` })
    if (recentFingerIds.has(s.finger_food_meal_id))
      flags.push({ day: s.day, slot: s.meal_slot, msg: `${finger.name} was already used today or yesterday` })

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
