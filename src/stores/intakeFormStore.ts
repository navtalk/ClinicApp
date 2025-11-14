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
    mainConcern: string
    symptomQuality: string
    symptomDuration: string
    additionalNotes: string
  }
  medicalHistory: {
    primaryPhysician: string
    chronicConditions: string
    surgicalHistory: string
    allergies: string
    familyHistory: string
  }
  lifestyle: {
    smokingStatus: 'never' | 'former' | 'current' | ''
    alcoholUse: 'none' | 'occasional' | 'regular' | ''
    sleepQuality: 'poor' | 'fair' | 'good' | ''
    exerciseFrequency: 'never' | 'weekly' | '3x-weekly' | 'daily' | ''
    dietNotes: string
  }
  medications: {
    currentMedications: string
    lastDose: string
    pharmacy: string
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
    fullName: '',
    gender: '',
    age: '',
    heightCm: '',
    weightKg: '',
  },
  chiefComplaint: {
    mainConcern: '',
    symptomQuality: '',
    symptomDuration: '',
    additionalNotes: '',
  },
  medicalHistory: {
    primaryPhysician: '',
    chronicConditions: '',
    surgicalHistory: '',
    allergies: '',
    familyHistory: '',
  },
  lifestyle: {
    smokingStatus: '',
    alcoholUse: '',
    sleepQuality: '',
    exerciseFrequency: '',
    dietNotes: '',
  },
  medications: {
    currentMedications: '',
    lastDose: '',
    pharmacy: '',
  },
  diagnostics: {
    recentTests: '',
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

watch(state, (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}, { deep: true })

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
    `Chief concern: ${chiefComplaint.mainConcern || 'not provided'}. Symptom quality: ${chiefComplaint.symptomQuality || 'n/a'}. Duration: ${chiefComplaint.symptomDuration || 'n/a'}.`,
    `Medical history includes: ${medicalHistory.chronicConditions || 'none reported'}. Surgical history: ${medicalHistory.surgicalHistory || 'none reported'}. Allergies: ${medicalHistory.allergies || 'none recorded'}.`,
    `Lifestyle factors - smoking: ${lifestyle.smokingStatus || 'n/a'}; alcohol: ${lifestyle.alcoholUse || 'n/a'}; exercise: ${lifestyle.exerciseFrequency || 'n/a'}.`,
    `Current medications: ${medications.currentMedications || 'not listed'}. Last dose noted as: ${medications.lastDose || 'n/a'}.`,
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
