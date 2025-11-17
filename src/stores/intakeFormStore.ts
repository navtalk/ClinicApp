import { reactive, watch } from 'vue'

const STORAGE_KEY = 'navtalk-clinic-intake'

export interface IntakeFormData {
  basicInfo: {
    fullName: string
    gender: 'male' | 'female' | 'other' | ''
    age: string
    heightCm: string
    weightKg: string
  }
  chiefComplaint: {
    mainSymptoms: string
    symptomDurationDays: string
    symptomPattern: 'acute' | 'subacute' | 'chronic' | ''
    possibleCause: string
    aggravatingFactors: string
    associatedSymptoms: string
    selfTreatment: string
  }
  medicalHistory: {
    previousDiagnosis: string
    surgicalHistory: string
    allergies: string
    familyHistory: string
  }
  lifestyle: {
    eatingHabits: 'regular' | 'irregular' | ''
    spicyFoodIntake: 'often' | 'occasionally' | 'never' | ''
    smokingFrequency: 'none' | 'lt5' | 'gt10' | ''
    alcoholUse: 'none' | 'occasional' | 'often' | ''
  }
  medications: {
    currentMedications: string
    medicationEffect: 'effective' | 'moderate' | 'ineffective' | ''
    drugAllergy: string
  }
  diagnostics: {
    recentTests: string
    attachments: Array<{
      name: string
      size: number
    }>
  }
}

const defaultState: IntakeFormData = {
  basicInfo: {
    fullName: 'Mara Collins',
    gender: 'female',
    age: '34',
    heightCm: '170',
    weightKg: '60',
  },
  chiefComplaint: {
    mainSymptoms: 'Persistent redness across cheeks with intermittent papules and mild itching.',
    symptomDurationDays: '14',
    symptomPattern: 'subacute',
    possibleCause: 'Reaction after switching to a new sunscreen and foundation.',
    aggravatingFactors: 'Heat, sun exposure, and spicy meals.',
    associatedSymptoms: 'Occasional burning sensation, no swelling.',
    selfTreatment: 'Tried over-the-counter hydrating serum with limited relief.',
  },
  medicalHistory: {
    previousDiagnosis: 'Mild seasonal allergies',
    surgicalHistory: 'Appendectomy (2015)',
    allergies: 'None reported',
    familyHistory: 'Mother with mild rosacea, father with hypertension',
  },
  lifestyle: {
    eatingHabits: 'regular',
    spicyFoodIntake: 'occasionally',
    smokingFrequency: 'none',
    alcoholUse: 'occasional',
  },
  medications: {
    currentMedications: 'Daily multivitamin, omega-3 supplement',
    medicationEffect: 'moderate',
    drugAllergy: 'None',
  },
  diagnostics: {
    recentTests: 'Recent CBC normal (January 2025), no imaging performed.',
    attachments: [],
  },
}

const cloneDefault = (): IntakeFormData => JSON.parse(JSON.stringify(defaultState))

function loadFromStorage(): IntakeFormData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefault()
    const parsed = JSON.parse(raw) as IntakeFormData
    const merged = cloneDefault()
    return deepMerge(merged, parsed)
  } catch (error) {
    console.warn('Unable to load intake form from storage', error)
    return cloneDefault()
  }
}

const state = reactive(loadFromStorage())

watch(
  state,
  (value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true }
)

export function useIntakeFormStore() {
  const reset = () => {
    Object.assign(state, cloneDefault())
  }

  const patch = (payload: Partial<IntakeFormData>) => {
    deepMerge(state, payload)
  }

  return {
    state,
    reset,
    patch,
  }
}

export function formatPatientSummary(data: IntakeFormData) {
  const { basicInfo, chiefComplaint, medicalHistory, lifestyle, medications } = data

  return [
    `Patient ${basicInfo.fullName || 'N/A'}, ${basicInfo.age ? `${basicInfo.age} years old` : 'age not specified'}.`,
    `Chief concern: ${chiefComplaint.mainSymptoms || 'not provided'}. Duration: ${chiefComplaint.symptomDurationDays || 'n/a'} day(s). Pattern: ${chiefComplaint.symptomPattern || 'n/a'}.`,
    `Medical history includes: ${medicalHistory.previousDiagnosis || 'none reported'}. Surgical history: ${medicalHistory.surgicalHistory || 'none reported'}. Allergies: ${medicalHistory.allergies || 'none recorded'}.`,
    `Lifestyle factors – eating habits: ${lifestyle.eatingHabits || 'n/a'}; spicy intake: ${lifestyle.spicyFoodIntake || 'n/a'}; smoking: ${lifestyle.smokingFrequency || 'n/a'}; alcohol: ${lifestyle.alcoholUse || 'n/a'}.`,
    `Current medications: ${medications.currentMedications || 'not listed'} (effect: ${medications.medicationEffect || 'n/a'}).`,
  ].join(' ')
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  Object.entries(source).forEach(([key, value]) => {
    const targetValue = (target as Record<string, any>)[key]
    if (Array.isArray(value)) {
      ;(target as Record<string, any>)[key] = [...value]
    } else if (value && typeof value === 'object') {
      ;(target as Record<string, any>)[key] = deepMerge(
        targetValue ?? {},
        value as Record<string, any>
      )
    } else if (value !== undefined) {
      ;(target as Record<string, any>)[key] = value
    }
  })
  return target
}
