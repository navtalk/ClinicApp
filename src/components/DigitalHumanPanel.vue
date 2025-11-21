<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, reactive } from 'vue'
import { useNavtalkRealtime } from '@/composables/useNavtalkRealtime'
import placeholderImage from '@/assets/doctor.png'

const props = withDefaults(
  defineProps<{
    license: string
    characterName?: string
    voice?: string
    prompt?: string
    baseUrl?: string
  }>(),
  {
    characterName: 'navtalk.Zoe',
    voice: 'cedar',
    prompt:
      'You are a friendly virtual physician. Greet the patient warmly, reference their intake answers, ask thoughtful follow-ups, and provide concise, compassionate guidance with clear next steps.',
    baseUrl: 'transfer.navtalk.ai',
  }
)

const videoRef = ref<HTMLVideoElement | null>(null)
const surfaceRef = ref<HTMLElement | null>(null)
const pipRef = ref<HTMLElement | null>(null)
const isVideoReady = ref(false)
const cameraPreviewRef = ref<HTMLVideoElement | null>(null)
const cameraStream = ref<MediaStream | null>(null)
const cameraEnabled = ref(false)
const isDragging = ref(false)
const pipPosition = reactive({ x: 0, y: 0 })
const ACTIVE_PADDING = 16
let activePointerId: number | null = null

const dragState = {
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
}

const navtalk = useNavtalkRealtime(
  {
    license: props.license,
    characterName: props.characterName,
    voice: props.voice,
    prompt: props.prompt,
    baseUrl: props.baseUrl,
  },
  {
    videoElement: () => videoRef.value,
  }
)

const sessionLabel = computed(() => {
  if (navtalk.isConnecting.value) return 'Connecting...'
  return navtalk.isActive.value ? 'End Call' : 'Start Call'
})

const canToggle = computed(() => !navtalk.isConnecting.value)

const toggleSession = () => {
  navtalk.toggle()
}

const toggleCamera = async () => {
  if (cameraEnabled.value) {
    stopCamera()
  } else {
    await startCamera()
  }
}

const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 180 },
      audio: false,
    })
    cameraStream.value = stream
    cameraEnabled.value = true

    await nextTick()
    if (cameraPreviewRef.value) {
      cameraPreviewRef.value.srcObject = stream
      cameraPreviewRef.value
        .play()
        .catch((error) => console.error('Camera preview failed to play', error))
    }
  } catch (error) {
    console.error('Failed to access camera', error)
    cameraStream.value = null
    cameraEnabled.value = false
  }
}

const stopCamera = () => {
  cameraStream.value?.getTracks().forEach((track) => track.stop())
  cameraStream.value = null
  cameraEnabled.value = false
  if (cameraPreviewRef.value) {
    cameraPreviewRef.value.srcObject = null
  }
}

const start = () => navtalk.start()
const stop = () => navtalk.stop()

defineExpose({ start, stop })

const handleVideoReady = () => {
  isVideoReady.value = true
}

const clampPosition = (x: number, y: number) => {
  const surface = surfaceRef.value
  const pip = pipRef.value
  if (!surface || !pip) {
    return { x, y }
  }
  const maxX = Math.max(ACTIVE_PADDING, surface.clientWidth - pip.offsetWidth - ACTIVE_PADDING)
  const maxY = Math.max(ACTIVE_PADDING, surface.clientHeight - pip.offsetHeight - ACTIVE_PADDING)
  return {
    x: Math.min(Math.max(x, ACTIVE_PADDING), maxX),
    y: Math.min(Math.max(y, ACTIVE_PADDING), maxY),
  }
}

const updatePipPosition = (x: number, y: number) => {
  const next = clampPosition(x, y)
  pipPosition.x = next.x
  pipPosition.y = next.y
}

const initializePipPosition = () => {
  nextTick(() => {
    const surface = surfaceRef.value
    const pip = pipRef.value
    if (!surface || !pip) return
    const defaultX = surface.clientWidth - pip.offsetWidth - 24
    updatePipPosition(defaultX, 24)
  })
}

const handleResize = () => {
  updatePipPosition(pipPosition.x, pipPosition.y)
}

const pipStyle = computed(() => ({
  transform: `translate3d(${pipPosition.x}px, ${pipPosition.y}px, 0)`,
  cursor: isDragging.value ? 'grabbing' : 'grab',
  transition: isDragging.value ? 'none' : 'transform 160ms ease-out',
}))

const onPipPointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return
  const deltaX = event.clientX - dragState.startX
  const deltaY = event.clientY - dragState.startY
  updatePipPosition(dragState.originX + deltaX, dragState.originY + deltaY)
}

const endDrag = () => {
  if (!isDragging.value) return
  isDragging.value = false
  if (activePointerId !== null) {
    pipRef.value?.releasePointerCapture?.(activePointerId)
    activePointerId = null
  }
  window.removeEventListener('pointermove', onPipPointerMove)
  window.removeEventListener('pointerup', onPipPointerUp)
}

const onPipPointerUp = () => {
  endDrag()
}

const onPipPointerDown = (event: PointerEvent) => {
  if (!pipRef.value) return
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.originX = pipPosition.x
  dragState.originY = pipPosition.y
  isDragging.value = true
  activePointerId = event.pointerId
  pipRef.value.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onPipPointerMove)
  window.addEventListener('pointerup', onPipPointerUp)
}

watch(
  () => navtalk.isActive.value,
  (active) => {
    if (!active) {
      isVideoReady.value = false
    }
  }
)

watch(cameraEnabled, () => {
  nextTick(() => {
    handleResize()
  })
})

onBeforeUnmount(() => {
  stopCamera()
  window.removeEventListener('resize', handleResize)
  endDrag()
})

onMounted(() => {
  void startCamera()
  initializePipPosition()
  window.addEventListener('resize', handleResize)
})
</script>

<template>
  <section class="consult-shell">
    <div ref="surfaceRef" class="video-surface">
      <video
        ref="videoRef"
        class="video-feed"
        autoplay
        playsinline
        :muted="!navtalk.isActive.value"
        @loadeddata="handleVideoReady"
        @playing="handleVideoReady"
      />

      <div v-if="!isVideoReady" class="placeholder-layer">
        <img :src="placeholderImage" alt="Digital physician placeholder" />
        <div class="loading-stack">
          <span class="spinner" aria-hidden="true"></span>
          <p>Connecting to your digital physician...</p>
        </div>
      </div>

      <div v-if="!navtalk.isActive.value && isVideoReady" class="idle-overlay">
        <img :src="placeholderImage" alt="Digital physician" />
      </div>

      <div
        ref="pipRef"
        class="picture-in-picture"
        :class="{ dragging: isDragging }"
        :style="pipStyle"
        @pointerdown.prevent="onPipPointerDown"
      >
        <div v-if="cameraEnabled" class="pip-video">
          <video
            ref="cameraPreviewRef"
            autoplay
            playsinline
            muted
            class="pip-preview"
          ></video>
        </div>
        <div v-else class="pip-card">No Camera</div>
      </div>

      <div class="status-chip">
        <span class="dot" :class="{ online: navtalk.isActive.value }"></span>
        {{ navtalk.statusMessage.value }}
      </div>
    </div>

    <div class="control-bar">
      <button
        class="icon-button"
        :class="{ inactive: !navtalk.isMicEnabled.value }"
        type="button"
        @click="navtalk.toggleMicrophone()"
      >
        <span class="icon mic"></span>
        {{ navtalk.isMicEnabled.value ? 'Microphone On' : 'Microphone Off' }}
      </button>
      <button
        class="primary-button"
        type="button"
        :disabled="!canToggle"
        @click="toggleSession"
      >
        {{ sessionLabel }}
      </button>
      <button class="icon-button" type="button" @click="toggleCamera">
        <span class="icon cam"></span>
        {{ cameraEnabled ? 'Camera Off' : 'Camera On' }}
      </button>
    </div>

    <p class="tip">
      Speak naturally and pause after each response. The digital doctor listens for silence before
      replying in real time.
    </p>

    <p v-if="navtalk.errorMessage.value" class="error">
      {{ navtalk.errorMessage.value }}
    </p>
  </section>
</template>

<style scoped>
.consult-shell {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  align-items: center;
}

.video-surface {
  position: relative;
  width: 100%;
  border-radius: 32px;
  overflow: hidden;
  background: linear-gradient(160deg, #343777 0%, #23264f 60%, #181931 100%);
  box-shadow: 0 35px 90px -60px rgba(5, 8, 40, 0.9);
}

.video-feed {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.idle-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, rgba(36, 38, 82, 0.85), rgba(13, 15, 34, 0.92));
}

.idle-overlay img {
  width: min(50%, 320px);
  border-radius: 28px;
  box-shadow: 0 18px 40px -30px rgba(0, 0, 0, 0.6);
}

.placeholder-layer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: linear-gradient(180deg, rgba(36, 38, 82, 0.85), rgba(13, 15, 34, 0.92));
}

.placeholder-layer img {
  width: min(55%, 340px);
  border-radius: 32px;
  box-shadow: 0 25px 60px -35px rgba(0, 0, 0, 0.65);
}

.loading-stack {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.picture-in-picture {
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
  user-select: none;
  cursor: grab;
  transition: transform 160ms ease-out;
}

.picture-in-picture.dragging {
  cursor: grabbing;
}

.pip-card {
  width: 140px;
  height: 96px;
  border-radius: 18px;
  background: rgba(8, 11, 38, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.85rem;
  border: 1px solid rgba(124, 131, 214, 0.2);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.pip-video {
  width: 140px;
  height: 96px;
  border-radius: 18px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 12px 24px -18px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.pip-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.status-chip {
  position: absolute;
  bottom: 1.6rem;
  left: 1.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  background: rgba(14, 16, 44, 0.7);
  font-weight: 600;
  font-size: 0.95rem;
}

.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #ffb347;
  animation: pulse 2s infinite;
}

.dot.online {
  background: #6fff97;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

.control-bar {
  display: inline-flex;
  align-items: center;
  gap: 1.25rem;
  background: rgba(12, 15, 45, 0.35);
  padding: 0.75rem 1.25rem;
  border-radius: 999px;
  backdrop-filter: blur(16px);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border: none;
  border-radius: 999px;
  padding: 0.6rem 1.2rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.icon-button:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.icon-button.inactive {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
}

.icon-button.inactive:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: none;
}

.icon {
  width: 1rem;
  height: 1rem;
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  filter: brightness(1.1);
}

.icon.mic {
  background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23ffffff' fill-opacity='0.9' d='M8 11a2.5 2.5 0 0 0 2.5-2.5v-4a2.5 2.5 0 0 0-5 0v4A2.5 2.5 0 0 0 8 11Zm3.5-2.5a3.5 3.5 0 0 1-7 0h-1a4.5 4.5 0 0 0 4 4.473V14H5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H8.5v-1.027a4.5 4.5 0 0 0 4-4.473h-1Z'/%3E%3C/svg%3E");
}

.icon.cam {
  background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23ffffff' fill-opacity='0.9' d='M2.5 4A1.5 1.5 0 0 0 1 5.5v5A1.5 1.5 0 0 0 2.5 12h6A1.5 1.5 0 0 0 10 10.5v-5A1.5 1.5 0 0 0 8.5 4h-6ZM11 6.18v3.64l3.146 1.573A.5.5 0 0 0 15 11V5a.5.5 0 0 0-.854-.354L11 6.18Z'/%3E%3C/svg%3E");
}

.primary-button {
  border: none;
  border-radius: 999px;
  padding: 0.7rem 2.2rem;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #ff6262 0%, #ff8585 100%);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.primary-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 18px 40px -30px rgba(255, 115, 115, 0.9);
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.tip {
  margin: 0;
  text-align: center;
  color: rgba(235, 236, 255, 0.7);
  max-width: 560px;
}

.error {
  margin: 0;
  background: rgba(255, 120, 120, 0.18);
  border: 1px solid rgba(255, 150, 150, 0.45);
  border-radius: 16px;
  padding: 0.75rem 1.2rem;
  color: #ffdede;
}

@media (max-width: 720px) {
  .video-surface {
    border-radius: 24px;
  }

  .picture-in-picture {
    top: 0;
    left: 0;
  }

  .pip-card {
    width: 110px;
    height: 78px;
  }

  .control-bar {
    flex-direction: column;
    gap: 0.75rem;
    border-radius: 24px;
  }

  .icon-button,
  .primary-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
