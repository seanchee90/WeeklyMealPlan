const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const SLOTS = ['lunch','dinner']

export function generatePlan(meals) {
  const purées = meals.filter(m => m.type === 'puree' && m.servings_available > 0)
  const fingers = meals.filter(m => m.type === 'finger_food' && m.servings_available > 0)

  const servings = {}
  meals.forEach(m => { servings[m.id] = m.servings_available })

  const slots = []
  const flags = []
  let prevPureeId = null
  let prevFingerId = null

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

      // Avoid repeating same combo as previous slot
      let puree = pickMeal(availPurées, prevPureeId)
      let finger = pickMeal(availFingers, prevFingerId)

      // If same combo as prev, try to swap one
      if (puree.id === prevPureeId && finger.id === prevFingerId) {
        const altFinger = availFingers.find(m => m.id !== prevFingerId)
        if (altFinger) finger = altFinger
        else {
          const altPuree = availPurées.find(m => m.id !== prevPureeId)
          if (altPuree) puree = altPuree
        }
      }

      // Rules check
      if (!puree.has_protein || !puree.has_veggie) {
        flags.push({ type: 'puree_missing_nutrient', day, slot, meal: puree.name, missing: getMissing(puree) })
      }
      if (!finger.has_protein || !finger.has_veggie) {
        flags.push({ type: 'finger_missing_nutrient', day, slot, meal: finger.name, missing: getMissing(finger) })
      }

      servings[puree.id]--
      servings[finger.id]--
      prevPureeId = puree.id
      prevFingerId = finger.id

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
    const prev = slots[i - 1]

    const puree = mealMap[s.puree_meal_id]
    const finger = mealMap[s.finger_food_meal_id]

    if (!puree) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing puree' }); continue }
    if (!finger) { flags.push({ day: s.day, slot: s.meal_slot, msg: 'Missing finger food' }); continue }

    if (!puree.has_protein || !puree.has_veggie)
      flags.push({ day: s.day, slot: s.meal_slot, msg: `${puree.name} is missing ${getMissing(puree)}` })
    if (!finger.has_protein || !finger.has_veggie)
      flags.push({ day: s.day, slot: s.meal_slot, msg: `${finger.name} is missing ${getMissing(finger)}` })

    if (prev && prev.puree_meal_id === s.puree_meal_id && prev.finger_food_meal_id === s.finger_food_meal_id)
      flags.push({ day: s.day, slot: s.meal_slot, msg: 'Same combo as previous meal' })
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

function pickMeal(available, avoidId) {
  return available.find(m => m.id !== avoidId) || available[0]
}

function getMissing(meal) {
  const missing = []
  if (!meal.has_protein) missing.push('protein')
  if (!meal.has_veggie) missing.push('veggie')
  return missing.join(' and ')
}
