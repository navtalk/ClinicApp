<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import DigitalHumanPanel from '@/components/DigitalHumanPanel.vue'
import { useIntakeFormStore } from '@/stores/intakeFormStore'
import { navtalkConfig } from '@/navtalk'

const { state } = useIntakeFormStore()
const config = navtalkConfig

const showConsultation = ref(false)
const digitalPanelRef = ref<{ start: () => Promise<void>; stop: () => Promise<void> } | null>(null)
const hasLicense = computed(() => config.license.trim().length > 0)
const consentChecked = ref(true)
const fileInputRef = ref<HTMLInputElement | null>(null)

const handleSubmit = async () => {
  if (!consentChecked.value) {
    return
  }
  showConsultation.value = true
  await nextTick()
  await digitalPanelRef.value?.start?.()
}

const restartIntake = async () => {
  await digitalPanelRef.value?.stop?.()
  showConsultation.value = false
}

const handleUploadClick = () => {
  fileInputRef.value?.click()
}

const handleFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  const files = Array.from(input.files).map((file) => ({
    name: file.name,
    size: file.size,
  }))
  state.diagnostics.attachments = files
  input.value = ''
}

const removeAttachment = (index: number) => {
  state.diagnostics.attachments = state.diagnostics.attachments.filter((_, i) => i !== index)
}

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / 1024).toFixed(1)} KB`
}

const toggleConsent = () => {
  consentChecked.value = !consentChecked.value
}
</script>

<template>
  <div class="layout" :class="{ 'layout--consultation': showConsultation }">
    <header class="top-bar">
      <a href="/" class="brand brand-link">
        <img src="/navtalk-logo.png" alt="NavTalk logo" class="brand-logo" />
      </a>
      <button v-if="showConsultation" type="button" class="secondary" @click="restartIntake">
        Back to Intake
      </button>
    </header>

    <main class="stage">
      <section v-if="!showConsultation" class="intake-hero">
        <div class="intake-copy">
          <h1>Please complete the intake form first</h1>
          <p>
            After submission you can immediately start your video consultation. Your information will
            be kept strictly confidential.
          </p>
        </div>

        <div class="intake-card">
          <form class="intake-form" @submit.prevent="handleSubmit">
            <fieldset>
              <legend>Basic Information</legend>
              <label>
                <span>Full Name</span>
                <input v-model="state.basicInfo.fullName" placeholder="Nora Doe" required />
              </label>

              <div class="radio-cluster">
                <span class="field-label">Gender</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.basicInfo.gender = 'female'">
                    <input v-model="state.basicInfo.gender" type="radio" value="female" required />
                    <span>Female</span>
                  </div>
                  <div class="radio-option" @click="state.basicInfo.gender = 'male'">
                    <input v-model="state.basicInfo.gender" type="radio" value="male" required />
                    <span>Male</span>
                  </div>
                  <div class="radio-option" @click="state.basicInfo.gender = 'other'">
                    <input v-model="state.basicInfo.gender" type="radio" value="other" required />
                    <span>Other</span>
                  </div>
                </div>
              </div>

              <div class="field-grid">
                <label class="with-unit">
                  <span>Age</span>
                  <div class="input-unit">
                    <input
                      v-model="state.basicInfo.age"
                      inputmode="numeric"
                      placeholder="28"
                    />
                  </div>
                </label>
              </div>

              <div class="field-grid">
                <label class="with-unit">
                  <span>Height</span>
                  <div class="input-unit">
                    <input
                      v-model="state.basicInfo.heightCm"
                      inputmode="decimal"
                      placeholder="170"
                    />
                    <span>cm</span>
                  </div>
                </label>
              </div>

              <div class="field-grid">
                <label class="with-unit">
                  <span>Weight</span>
                  <div class="input-unit">
                    <input
                      v-model="state.basicInfo.weightKg"
                      inputmode="decimal"
                      placeholder="55"
                    />
                    <span>kg</span>
                  </div>
                </label>
              </div>
              
            </fieldset>

            <fieldset>
              <legend>Chief Complaint</legend>
              <label>
                <span>Main Symptoms</span>
                <textarea
                  v-model="state.chiefComplaint.mainSymptoms"
                  rows="2"
                  placeholder="Redness on the face with small pimples and mild itching"
                />
              </label>

              <div class="field-grid">
                <label class="with-unit">
                  <span>Symptom Duration</span>
                  <div class="input-unit">
                    <input
                      v-model="state.chiefComplaint.symptomDurationDays"
                      inputmode="decimal"
                      placeholder="17"
                    />
                    <span>day(s)</span>
                  </div>
                </label>
              </div>
              <div class="radio-cluster">
                <span class="field-label">Symptom Pattern</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.chiefComplaint.symptomPattern = 'acute'">
                    <input v-model="state.chiefComplaint.symptomPattern" type="radio" value="acute" />
                    <span>Acute</span>
                  </div>
                  <div class="radio-option" @click="state.chiefComplaint.symptomPattern = 'subacute'">
                    <input
                      v-model="state.chiefComplaint.symptomPattern"
                      type="radio"
                      value="subacute"
                    />
                    <span>Subacute</span>
                  </div>
                  <div class="radio-option" @click="state.chiefComplaint.symptomPattern = 'chronic'">
                    <input
                      v-model="state.chiefComplaint.symptomPattern"
                      type="radio"
                      value="chronic"
                    />
                    <span>Chronic</span>
                  </div>
                </div>
              </div>
              <label>
                <span>Possible cause</span>
                <input
                  v-model="state.chiefComplaint.possibleCause"
                  placeholder="Recently changed sunscreen and foundation"
                />
              </label>
              <label>
                <span>Aggravating/Relieving factors</span>
                <input
                  v-model="state.chiefComplaint.aggravatingFactors"
                  placeholder="Worsens with sun exposure or heat"
                />
              </label>
              <label>
                <span>Associated symptoms</span>
                <input
                  v-model="state.chiefComplaint.associatedSymptoms"
                  placeholder="Mild itching, no pain"
                />
              </label>
              <label>
                <span>Self-treatment or medications used</span>
                <textarea
                  v-model="state.chiefComplaint.selfTreatment"
                  rows="2"
                  placeholder="Used gentle cleanser and benzoyl peroxide gel; slightly improved"
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Past Medical History</legend>
              <label>
                <span>Previous Diagnosis</span>
                <input v-model="state.medicalHistory.previousDiagnosis" placeholder="Hypertension" />
              </label>
              <label>
                <span>Surgical history</span>
                <input v-model="state.medicalHistory.surgicalHistory" placeholder="None" />
              </label>
              <label>
                <span>Allergies</span>
                <input v-model="state.medicalHistory.allergies" placeholder="None" />
              </label>
              <label>
                <span>Family History</span>
                <input
                  v-model="state.medicalHistory.familyHistory"
                  placeholder="Mother has mild rosacea"
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Lifestyle Habits</legend>
              <div class="radio-cluster">
                <span class="field-label">Eating Habits</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.lifestyle.eatingHabits = 'regular'">
                    <input v-model="state.lifestyle.eatingHabits" type="radio" value="regular" />
                    <span>Regular</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.eatingHabits = 'irregular'">
                    <input v-model="state.lifestyle.eatingHabits" type="radio" value="irregular" />
                    <span>Irregular</span>
                  </div>
                </div>
              </div>
              <div class="radio-cluster">
                <span class="field-label">Spicy / Fatty Food Intake</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.lifestyle.spicyFoodIntake = 'often'">
                    <input v-model="state.lifestyle.spicyFoodIntake" type="radio" value="often" />
                    <span>Often</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.spicyFoodIntake = 'occasionally'">
                    <input
                      v-model="state.lifestyle.spicyFoodIntake"
                      type="radio"
                      value="occasionally"
                    />
                    <span>Occasionally</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.spicyFoodIntake = 'never'">
                    <input v-model="state.lifestyle.spicyFoodIntake" type="radio" value="never" />
                    <span>Never</span>
                  </div>
                </div>
              </div>
              <div class="radio-cluster">
                <span class="field-label">Smoking</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.lifestyle.smokingFrequency = 'none'">
                    <input v-model="state.lifestyle.smokingFrequency" type="radio" value="none" />
                    <span>No</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.smokingFrequency = 'lt5'">
                    <input v-model="state.lifestyle.smokingFrequency" type="radio" value="lt5" />
                    <span>&lt;5/day</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.smokingFrequency = 'gt10'">
                    <input v-model="state.lifestyle.smokingFrequency" type="radio" value="gt10" />
                    <span>&gt;10/day</span>
                  </div>
                </div>
              </div>
              <div class="radio-cluster">
                <span class="field-label">Alcohol</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.lifestyle.alcoholUse = 'none'">
                    <input v-model="state.lifestyle.alcoholUse" type="radio" value="none" />
                    <span>No</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.alcoholUse = 'occasional'">
                    <input v-model="state.lifestyle.alcoholUse" type="radio" value="occasional" />
                    <span>Occasionally</span>
                  </div>
                  <div class="radio-option" @click="state.lifestyle.alcoholUse = 'often'">
                    <input v-model="state.lifestyle.alcoholUse" type="radio" value="often" />
                    <span>Often</span>
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Medications</legend>
              <label>
                <span>Current Medications</span>
                <textarea
                  v-model="state.medications.currentMedications"
                  rows="2"
                  placeholder="Benzoyl peroxide gel"
                />
              </label>
              <div class="radio-cluster">
                <span class="field-label">Medication Effect</span>
                <div class="radio-row">
                  <div class="radio-option" @click="state.medications.medicationEffect = 'effective'">
                    <input v-model="state.medications.medicationEffect" type="radio" value="effective" />
                    <span>Effective</span>
                  </div>
                  <div class="radio-option" @click="state.medications.medicationEffect = 'moderate'">
                    <input
                      v-model="state.medications.medicationEffect"
                      type="radio"
                      value="moderate"
                    />
                    <span>Moderate</span>
                  </div>
                  <div class="radio-option" @click="state.medications.medicationEffect = 'ineffective'">
                    <input
                      v-model="state.medications.medicationEffect"
                      type="radio"
                      value="ineffective"
                    />
                    <span>Ineffective</span>
                  </div>
                </div>
              </div>
              <label>
                <span>Drug Allergy</span>
                <input v-model="state.medications.drugAllergy" placeholder="None" />
              </label>
            </fieldset>

            <fieldset>
              <legend>Test Report Upload</legend>
              <p class="upload-helper">
                Please upload any relevant medical reports, such as gastroscopy, ultrasound, blood
                tests, or imaging reports.
              </p>
              <div class="upload-dropzone" @click="handleUploadClick">
                <span class="upload-plus">+</span>
                <p>Upload</p>
              </div>
              <input
                ref="fileInputRef"
                type="file"
                class="sr-only"
                multiple
                @change="handleFilesSelected"
              />
              <ul v-if="state.diagnostics.attachments.length" class="attachment-list">
                <li v-for="(file, index) in state.diagnostics.attachments" :key="file.name">
                  <div>
                    <strong>{{ file.name }}</strong>
                    <span>{{ formatFileSize(file.size) }}</span>
                  </div>
                  <button type="button" class="link-button" @click.stop="removeAttachment(index)">
                    Remove
                  </button>
                </li>
              </ul>
            </fieldset>

            <div class="form-footer">
                  <div class="consent">
                <div class="checkbox-option" @click="toggleConsent">
                  <input v-model="consentChecked" type="checkbox" @click.stop />
                  <span>
                    By checking this box, you agree to allow the AI system to record your consultation
                    data. Your information will be used solely for the purpose of AI-assisted medical
                    consultation and will be protected according to our privacy policy.
                  </span>
                </div>
              </div>
              <button class="sr-only" type="submit">Submit</button>
            </div>
          </form>
        </div>
        <div class="submit-bar">
          <div>
            <strong>Ready to begin?</strong>
            <p>Review your intake details and start the video consultation.</p>
          </div>
          <button class="primary" type="button" @click="handleSubmit">
            Submit and Start Video Consultation
          </button>
        </div>
      </section>

      <section v-else class="consultation-hero">
        <DigitalHumanPanel
          ref="digitalPanelRef"
          :license="config.license"
          :character-name="config.characterName"
          :voice="config.voice"
          :prompt="config.prompt"
          :base-url="config.baseUrl"
        />
        <p v-if="!hasLicense" class="license-warning">
          <strong>Missing NavTalk license key.</strong>
          Update <code>src/navtalk.ts</code> with your credentials to enable the live session.
        </p>
      </section>
    </main>

    <footer class="footnote">
      &copy; {{ new Date().getFullYear() }} NavTalk Clinic. All rights reserved.
    </footer>
  </div>
</template>
