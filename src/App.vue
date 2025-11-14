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

const handleSubmit = async () => {
  showConsultation.value = true
  await nextTick()
  await digitalPanelRef.value?.start?.()
}

const restartIntake = async () => {
  await digitalPanelRef.value?.stop?.()
  showConsultation.value = false
}
</script>

<template>
  <div class="layout" :class="{ 'layout--consultation': showConsultation }">
    <header class="top-bar">
      <div class="brand">
        <span class="brand-icon">NT</span>
        <span class="brand-text">NavTalk Clinic</span>
      </div>
      <button v-if="showConsultation" type="button" class="secondary" @click="restartIntake">
        Back to Intake
      </button>
    </header>

    <main class="stage">
      <section v-if="!showConsultation" class="intake-hero">
        <div class="intake-card">
          <header class="intake-header">
            <h1>Please complete the intake form first</h1>
            <p>
              After submission you can immediately start your video consultation.
              Your information will be kept strictly confidential.
            </p>
          </header>

          <form class="intake-form" @submit.prevent="handleSubmit">
            <fieldset>
              <legend>Basic Information</legend>
              <label>
                <span>Full Name</span>
                <input v-model="state.basicInfo.fullName" placeholder="Nora Doe" required />
              </label>

              <div class="field-row">
                <span class="field-label">Gender</span>
                <label>
                  <input v-model="state.basicInfo.gender" type="radio" value="female" required />
                  Female
                </label>
                <label>
                  <input v-model="state.basicInfo.gender" type="radio" value="male" required />
                  Male
                </label>
                <label>
                  <input v-model="state.basicInfo.gender" type="radio" value="other" required />
                  Other
                </label>
              </div>

              <div class="field-grid">
                <label>
                  <span>Age</span>
                  <input v-model="state.basicInfo.age" inputmode="numeric" placeholder="28" />
                </label>
                <label class="with-unit">
                  <span>Height</span>
                  <div class="input-unit">
                    <input v-model="state.basicInfo.heightCm" inputmode="decimal" placeholder="170" />
                    <span>cm</span>
                  </div>
                </label>
                <label class="with-unit">
                  <span>Weight</span>
                  <div class="input-unit">
                    <input v-model="state.basicInfo.weightKg" inputmode="decimal" placeholder="55" />
                    <span>kg</span>
                  </div>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Chief Complaint</legend>
              <label>
                <span>Main Symptoms</span>
                <input
                  v-model="state.chiefComplaint.mainConcern"
                  placeholder="Redness on the face with small pimples and mild itching"
                />
              </label>
              <label>
                <span>Symptom Duration</span>
                <div class="input-unit">
                  <input
                    v-model="state.chiefComplaint.symptomDuration"
                    inputmode="decimal"
                    placeholder="17"
                  />
                  <span>day(s)</span>
                </div>
              </label>
              <label>
                <span>Additional Details</span>
                <textarea
                  v-model="state.chiefComplaint.additionalNotes"
                  rows="3"
                  placeholder="Triggers, treatments you've tried, or anything else the doctor should know..."
                />
              </label>
            </fieldset>

            <fieldset>
              <legend>Medical Background</legend>
              <label>
                <span>Medical History</span>
                <textarea
                  v-model="state.medicalHistory.chronicConditions"
                  rows="2"
                  placeholder="Hypertension, seasonal allergies..."
                />
              </label>
              <label>
                <span>Current Medications</span>
                <textarea
                  v-model="state.medications.currentMedications"
                  rows="2"
                  placeholder="Benzoyl peroxide gel (topical) - used nightly"
                />
              </label>
            </fieldset>

            <div class="form-footer">
              <div class="consent">
                <input type="checkbox" required />
                <span>
                  You have completed the intake form. Please review your information.
                  Once submitted, you will start a video consultation with the AI doctor.
                </span>
              </div>
              <button class="primary" type="submit">
                Submit and Start Video Consultation
              </button>
            </div>
          </form>
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

