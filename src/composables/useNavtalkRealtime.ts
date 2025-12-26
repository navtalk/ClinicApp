import { onBeforeUnmount, reactive, ref, watch } from 'vue'

const NavTalkMessageType = Object.freeze({
  CONNECTED_SUCCESS: 'conversation.connected.success',
  CONNECTED_FAIL: 'conversation.connected.fail',
  CONNECTED_CLOSE: 'conversation.connected.close',
  INSUFFICIENT_BALANCE: 'conversation.connected.insufficient_balance',
  WEB_RTC_OFFER: 'webrtc.signaling.offer',
  WEB_RTC_ANSWER: 'webrtc.signaling.answer',
  WEB_RTC_ICE_CANDIDATE: 'webrtc.signaling.iceCandidate',
  REALTIME_SESSION_CREATED: 'realtime.session.created',
  REALTIME_SESSION_UPDATED: 'realtime.session.updated',
  REALTIME_SPEECH_STARTED: 'realtime.input_audio_buffer.speech_started',
  REALTIME_SPEECH_STOPPED: 'realtime.input_audio_buffer.speech_stopped',
  REALTIME_CONVERSATION_ITEM_COMPLETED:
    'realtime.conversation.item.input_audio_transcription.completed',
  REALTIME_RESPONSE_AUDIO_TRANSCRIPT_DELTA: 'realtime.response.audio_transcript.delta',
  REALTIME_RESPONSE_AUDIO_DELTA: 'realtime.response.audio.delta',
  REALTIME_RESPONSE_AUDIO_TRANSCRIPT_DONE: 'realtime.response.audio_transcript.done',
  REALTIME_RESPONSE_AUDIO_DONE: 'realtime.response.audio.done',
  REALTIME_RESPONSE_FUNCTION_CALL_ARGUMENTS_DELTA:
    'realtime.response.function_call_arguments.delta',
  REALTIME_RESPONSE_FUNCTION_CALL_ARGUMENTS_DONE:
    'realtime.response.function_call_arguments.done',
  REALTIME_INPUT_AUDIO_BUFFER_APPEND: 'realtime.input_audio_buffer.append',
  REALTIME_INPUT_TEXT: 'realtime.input_text',
  REALTIME_INPUT_IMAGE: 'realtime.input_image',
  RESPONSE_CREATE: 'response.create',
  UNKNOWN_TYPE: 'unknown',
} as const)

const CHAT_STORAGE_KEY = 'navtalk-realtime-chat'

export type ConversationRole = 'user' | 'assistant'

export interface ConversationMessage {
  id: string
  role: ConversationRole
  content: string
  timestamp: number
}

export interface NavtalkConfig {
  license: string
  characterName: string
  voice: string
  prompt: string
  baseUrl?: string
  model?: string
}

export interface UseNavtalkRealtimeOptions {
  videoElement: () => HTMLVideoElement | null
  onError?: (message: string) => void
}

const ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const AUTO_HANGUP_INSTRUCTIONS =
  'When the patient clearly indicates they want to end the call (bye, thanks, want to leave, etc.), respond graciously and then call the `end_conversation` tool once your reply is complete so the session can hang up automatically.'

const END_CONVERSATION_TOOL = {
  type: 'function',
  name: 'end_conversation',
  description:
    'Invoke this when the patient wants to hang up or you need to terminate the realtime consultation so the client can stop the call.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Brief explanation of why the call should end (e.g., patient said goodbye).',
      },
    },
    required: ['reason'],
  },
} as const

const AUTO_HANGUP_DELAY_MS = 2000

export function useNavtalkRealtime(config: NavtalkConfig, options: UseNavtalkRealtimeOptions) {
  const baseUrl = config.baseUrl ?? 'transfer.navtalk.ai'

  const isActive = ref(false)
  const isConnecting = ref(false)
  const statusMessage = ref('Idle')
  const errorMessage = ref('')
  const chatMessages = ref<ConversationMessage[]>(loadChatHistory())
  const streamingResponses = reactive<Record<string, string>>({})

  let socket: WebSocket | null = null
  let peerConnection: RTCPeerConnection | null = null
  let audioContext: AudioContext | null = null
  let audioProcessor: ScriptProcessorNode | null = null
  let audioStream: MediaStream | null = null
  let configuration: RTCConfiguration = { ...ICE_CONFIGURATION }
  const isMicEnabled = ref(true)
  const functionCallArguments: Record<string, string> = {}
  let pendingHangupReason: string | null = null
  let hangupTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    chatMessages,
    (value) => {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(value))
      } catch (error) {
        console.warn('Unable to persist chat history', error)
      }
    },
    { deep: true }
  )

  const debug = (...args: unknown[]) => {
    console.log('[NavTalk]', ...args)
  }

  const maskLicense = (value: string | null | undefined) => {
    if (!value) return '(empty)'
    if (value.length <= 8) return `${value.slice(0, 2)}***`
    return `${value.slice(0, 4)}...${value.slice(-4)}`
  }

  const notifyError = (message: string) => {
    errorMessage.value = message
    options.onError?.(message)
  }

  const resetStreamingState = () => {
    Object.keys(streamingResponses).forEach((key) => delete streamingResponses[key])
  }

  const appendMessage = (message: Omit<ConversationMessage, 'id' | 'timestamp'>) => {
    chatMessages.value.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...message,
    })
  }

const start = async () => {
    if (isConnecting.value || isActive.value) return

    if (!config.license) {
      notifyError('NavTalk license key missing. Update src/navtalk.ts with your key.')
      return
    }

    debug('Starting session', {
      license: maskLicense(config.license),
      character: config.characterName,
      voice: config.voice,
      baseUrl,
    })

    resetStreamingState()
    errorMessage.value = ''
    statusMessage.value = 'Connecting...'
    isConnecting.value = true

    try {
      await openRealtimeSocket()
      isActive.value = true
      statusMessage.value = 'Ready'
    } catch (error) {
      notifyError('Unable to start conversation. Please try again.')
      console.error(error)
      await stop()
      debug('Session start failed', error)
    } finally {
      isConnecting.value = false
    }
  }

  const stop = async () => {
    debug('Stopping session')
    statusMessage.value = 'Idle'
    isConnecting.value = false
    isActive.value = false
    pendingHangupReason = null
    if (hangupTimeout) {
      clearTimeout(hangupTimeout)
      hangupTimeout = null
    }
    Object.keys(functionCallArguments).forEach((key) => delete functionCallArguments[key])

    cleanupAudio()
    cleanupPeerConnection()
    cleanupSockets()
  }

  const cleanupSockets = () => {
    if (socket) {
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      try {
        socket.close()
      } catch (error) {
        console.error('Error closing realtime socket', error)
      }
      socket = null
    }
  }

  const cleanupPeerConnection = () => {
    if (peerConnection) {
      try {
        peerConnection.onicecandidate = null
        peerConnection.ontrack = null
        peerConnection.oniceconnectionstatechange = null
        peerConnection.onconnectionstatechange = null
        peerConnection.close()
      } catch (error) {
        console.error('Error closing peer connection', error)
      }
      peerConnection = null
    }

    const video = options.videoElement()
    if (video) {
      try {
        video.pause()
      } catch (error) {
        // ignore
      }
      video.srcObject = null
    }
  }

  const cleanupAudio = () => {
    if (audioProcessor) {
      try {
        audioProcessor.disconnect()
      } catch (error) {
        // ignore
      }
      audioProcessor.onaudioprocess = null
      audioProcessor = null
      debug('Audio processor stopped')
    }

    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop())
      audioStream = null
      debug('Audio stream tracks stopped')
    }

    if (audioContext) {
      audioContext.close().catch(() => undefined)
      audioContext = null
      debug('Audio context closed')
    }
  }

  const buildRealtimeEndpoint = () => {
    const trimmedBase = baseUrl.trim().replace(/\/+$/, '')
    const normalizedBase = /^(?:wss?:\/\/|https?:\/\/)/i.test(trimmedBase)
      ? trimmedBase
      : `wss://${trimmedBase}`
    const endpointUrl = new URL('/wss/v2/realtime-chat', normalizedBase)
    endpointUrl.searchParams.set('license', config.license)
    endpointUrl.searchParams.set('name', config.characterName)
    if (config.model?.trim()) {
      endpointUrl.searchParams.set('model', config.model.trim())
    }
    return endpointUrl.toString()
  }

  const sendAnswerMessage = (sdp: RTCSessionDescriptionInit | null) => {
    if (!socket || !sdp) return
    socket.send(
      JSON.stringify({
        type: NavTalkMessageType.WEB_RTC_ANSWER,
        data: { sdp },
      })
    )
  }

  const sendIceMessage = (candidate: RTCIceCandidate | null) => {
    if (!socket || !candidate) return
    socket.send(
      JSON.stringify({
        type: NavTalkMessageType.WEB_RTC_ICE_CANDIDATE,
        data: { candidate },
      })
    )
  }

  const openRealtimeSocket = () =>
    new Promise<void>((resolve, reject) => {
      const endpoint = buildRealtimeEndpoint()
      socket = new WebSocket(endpoint)
      socket.binaryType = 'arraybuffer'
      debug('Opening realtime socket', endpoint)

      socket.onopen = () => {
        statusMessage.value = 'Connected'
        debug('Realtime socket open')
        resolve()
      }

      socket.onerror = (event) => {
        debug('Realtime socket error', event)
        reject(event)
      }

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data)
            handleRealtimeEvent(data)
          } catch (error) {
            console.error('Unable to parse realtime message', error)
          }
        }
      }

      socket.onclose = (event) => {
        debug('Realtime socket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })

        if (event.reason === 'Insufficient points') {
          notifyError('You need more points to complete this action.')
        }

        if (isActive.value) {
          void stop()
        } else {
          cleanupSockets()
        }
      }
    })

  const sendSessionUpdate = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const instructions = [config.prompt?.trim(), AUTO_HANGUP_INSTRUCTIONS].filter(Boolean).join('\n\n')

    const connection = socket
    const sessionConfig = {
      type: 'session.update',
      session: {
        instructions,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        voice: config.voice,
        temperature: 1,
        max_response_output_tokens: 4096,
        modalities: ['text', 'audio'],
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        tools: [END_CONVERSATION_TOOL],
      },
    }

    connection.send(JSON.stringify(sessionConfig))
    debug('Session configuration sent')

    chatMessages.value.forEach((message) => {
      if (message.role !== 'user') return
      const text = message.content?.trim()
      if (!text) return
      const historyMessage = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text,
            },
          ],
        },
      }
      connection.send(JSON.stringify(historyMessage))
      debug('Replayed user message for session context', text)
    })
  }

  const requestAssistantResponse = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send(JSON.stringify({ type: NavTalkMessageType.RESPONSE_CREATE }))
      debug('response.create sent')
    } catch (error) {
      console.error('Failed to request assistant response', error)
    }
  }

  const sendImageFrame = (dataUrl: string, requestResponse = false) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    if (!dataUrl.startsWith('data:image')) {
      console.warn('sendImageFrame called with non-image payload')
      return false
    }

    const payload = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user' as const,
        content: [
          {
            type: 'input_image',
            image_url: dataUrl,
          },
        ],
      },
    }

    socket.send(JSON.stringify(payload))
    debug('Camera frame sent')
    if (requestResponse) {
      requestAssistantResponse()
    }
    return true
  }

  const handleRealtimeEvent = (event: any) => {
    if (!event || typeof event.type !== 'string') {
      debug('Realtime event missing type', event)
      return
    }

    const payload = event.data ?? {}
    switch (event.type) {
      case NavTalkMessageType.CONNECTED_SUCCESS:
        if (Array.isArray(payload.iceServers) && payload.iceServers.length) {
          configuration = {
            ...configuration,
            iceServers: payload.iceServers,
          }
        }
        statusMessage.value = 'Connected'
        break
      case NavTalkMessageType.CONNECTED_FAIL:
      case NavTalkMessageType.CONNECTED_CLOSE:
        notifyError(payload?.message ?? 'Connection error occurred.')
        if (isActive.value) {
          void stop()
        }
        break
      case NavTalkMessageType.INSUFFICIENT_BALANCE:
        notifyError(payload?.message ?? 'Account balance is insufficient. Please top up to continue.')
        break
      case NavTalkMessageType.REALTIME_SESSION_CREATED:
        sendSessionUpdate()
        break
      case NavTalkMessageType.REALTIME_SESSION_UPDATED:
        statusMessage.value = 'Ready'
        requestAssistantResponse()
        startRecording()
        break
      case NavTalkMessageType.WEB_RTC_OFFER:
        handleOffer(payload)
        break
      case NavTalkMessageType.WEB_RTC_ANSWER:
        handleAnswer(payload)
        break
      case NavTalkMessageType.WEB_RTC_ICE_CANDIDATE:
        handleIceCandidate(payload)
        break
      case NavTalkMessageType.REALTIME_SPEECH_STARTED:
        statusMessage.value = 'Patient speaking'
        resetStreamingState()
        break
      case NavTalkMessageType.REALTIME_SPEECH_STOPPED:
        statusMessage.value = 'Processing response'
        break
      case NavTalkMessageType.REALTIME_CONVERSATION_ITEM_COMPLETED: {
        const transcript = payload.content ?? event.transcript
        if (typeof transcript === 'string' && transcript.trim()) {
          appendMessage({ role: 'user', content: transcript.trim() })
        }
        break
      }
      case NavTalkMessageType.REALTIME_RESPONSE_AUDIO_TRANSCRIPT_DELTA: {
        const responseId = payload.response_id ?? payload.id ?? payload.responseId
        const delta = payload.delta ?? payload.content
        if (!responseId || typeof delta !== 'string') break
        streamingResponses[responseId] = (streamingResponses[responseId] || '') + delta
        statusMessage.value = 'Responding'
        break
      }
      case NavTalkMessageType.REALTIME_RESPONSE_AUDIO_TRANSCRIPT_DONE: {
        const responseId = payload.response_id ?? payload.id ?? payload.responseId
        if (!responseId) break
        const content = payload.transcript ?? streamingResponses[responseId] ?? ''
        if (content) {
          appendMessage({ role: 'assistant', content })
        }
        delete streamingResponses[responseId]
        statusMessage.value = 'Listening'
        break
      }
      case NavTalkMessageType.REALTIME_RESPONSE_AUDIO_DONE:
        statusMessage.value = 'Listening'
        finalizeScheduledHangup()
        break
      case NavTalkMessageType.REALTIME_RESPONSE_FUNCTION_CALL_ARGUMENTS_DELTA: {
        const callId = payload.call_id ?? payload.callId
        if (!callId || typeof payload.delta !== 'string') break
        functionCallArguments[callId] = (functionCallArguments[callId] || '') + payload.delta
        break
      }
      case NavTalkMessageType.REALTIME_RESPONSE_FUNCTION_CALL_ARGUMENTS_DONE: {
        const callId = payload.call_id ?? payload.callId
        let args = payload.arguments ?? (callId ? functionCallArguments[callId] : undefined)
        if (args && typeof args !== 'string') {
          args = JSON.stringify(args)
        }
        if (callId) {
          delete functionCallArguments[callId]
        }
        handleFunctionCall({
          name: payload.name ?? payload.function_name,
          call_id: callId,
          arguments: typeof args === 'string' ? args : undefined,
        })
        statusMessage.value = 'Listening'
        break
      }
      case 'response.done':
        statusMessage.value = 'Ready'
        break
      case 'session.gpu_full':
        notifyError('GPU resources are currently busy. Please try again later.')
        break
      case 'session.insufficient_balance':
        notifyError('Account balance is insufficient. Please top up to continue.')
        break
      case 'error':
        debug('Realtime error event', event)
        break
      default:
        debug('Unhandled realtime event type', event.type)
        break
    }
  }

  const handleFunctionCall = (payload: { name?: string; call_id?: string; arguments?: string }) => {
    if (!payload) return
    let args: Record<string, unknown> = {}
    if (typeof payload.arguments === 'string' && payload.arguments.trim()) {
      try {
        args = JSON.parse(payload.arguments)
      } catch (error) {
        console.error('Unable to parse function call arguments', error)
      }
    }

    switch (payload.name) {
      case END_CONVERSATION_TOOL.name:
        handleHangupIntent(args, payload.call_id)
        break
      default:
        debug('Unhandled function call request', payload.name, args)
        if (payload.call_id) {
          sendFunctionCallResult(payload.call_id, {
            status: 'ignored',
            reason: `Client has no handler for ${payload.name ?? 'unknown'} function.`,
          })
        }
        break
    }
  }

  const handleHangupIntent = (args: Record<string, unknown>, callId?: string) => {
    const argBundle = args as { reason?: unknown }
    const rawReason = typeof argBundle.reason === 'string' ? argBundle.reason.trim() : ''
    const reason = rawReason || 'Patient requested to end the consultation.'
    debug('Auto hangup intent received', reason)
    scheduleAutomaticHangup(reason)

    if (callId) {
      sendFunctionCallResult(callId, {
        action: 'auto_hangup',
        status: 'scheduled',
        reason,
      })
    }
  }

  const sendFunctionCallResult = (callId: string, result: unknown) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const output = typeof result === 'string' ? result : JSON.stringify(result)
    const payload = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output,
      },
    }

    socket.send(JSON.stringify(payload))
    requestAssistantResponse()
    debug('Function call result sent', payload)
  }

  const scheduleAutomaticHangup = (reason: string) => {
    pendingHangupReason = reason
    if (hangupTimeout) {
      clearTimeout(hangupTimeout)
      hangupTimeout = null
    }
    debug('Auto hangup scheduled after current response', reason)
  }

  const finalizeScheduledHangup = () => {
    if (!pendingHangupReason) return
    const reason = pendingHangupReason
    pendingHangupReason = null
    if (hangupTimeout) {
      clearTimeout(hangupTimeout)
      hangupTimeout = null
    }

    hangupTimeout = setTimeout(() => {
      hangupTimeout = null
      triggerAutomaticHangup(reason)
    }, AUTO_HANGUP_DELAY_MS)
  }

  const triggerAutomaticHangup = (reason: string) => {
    if (!isActive.value) {
      debug('Auto hangup skipped because session already inactive', reason)
      return
    }
    debug('Triggering auto hangup', reason)
    void stop()
  }

  const startRecording = () => {
    if (!isMicEnabled.value) {
      debug('Microphone disabled, skipping start')
      return
    }
    if (audioContext || typeof navigator === 'undefined') return

    debug('Requesting microphone access')
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
        audioContext = new AudioContextCtor({ sampleRate: 24000 })
        audioStream = stream

        const source = audioContext.createMediaStreamSource(stream)
        audioProcessor = audioContext.createScriptProcessor(8192, 1, 1)

        audioProcessor.onaudioprocess = (event) => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return
          const inputBuffer = event.inputBuffer.getChannelData(0)
          const pcmData = floatTo16BitPCM(inputBuffer)
          const base64PCM = base64EncodeAudio(new Uint8Array(pcmData))
          const chunkSize = 4096
          for (let i = 0; i < base64PCM.length; i += chunkSize) {
            const chunk = base64PCM.slice(i, i + chunkSize)
            socket.send(
              JSON.stringify({
                type: NavTalkMessageType.REALTIME_INPUT_AUDIO_BUFFER_APPEND,
                data: { audio: chunk },
              })
            )
          }
        }

        source.connect(audioProcessor)
        audioProcessor.connect(audioContext.destination)
        debug('Microphone streaming started', {
          sampleRate: audioContext.sampleRate,
          tracks: stream.getAudioTracks().map((track) => track.label || track.kind),
        })
      })
      .catch((error) => {
        console.error('Unable to access microphone', error)
        notifyError('Unable to access microphone. Please enable browser audio permissions.')
      })
  }

  const enableMicrophone = async () => {
    if (isMicEnabled.value) return
    isMicEnabled.value = true
    if (isActive.value && !audioContext) {
      startRecording()
    }
  }

  const disableMicrophone = () => {
    if (!isMicEnabled.value) return
    isMicEnabled.value = false
    cleanupAudio()
  }

  const toggleMicrophone = () => {
    if (isMicEnabled.value) {
      disableMicrophone()
    } else {
      enableMicrophone()
    }
  }

  const handleOffer = async (message: any) => {
    try {
      debug('Handling offer')
      const offer = new RTCSessionDescription(message.sdp)

      try {
        const response = await fetch(`https://${baseUrl}/api/webrtc/generate-ice-servers`, {
          method: 'POST',
        })
        if (response.ok) {
          const body = await response.json()
          const servers = body?.data?.iceServers ?? body?.iceServers
          if (Array.isArray(servers) && servers.length) {
            configuration = { iceServers: servers }
            debug('ICE servers received', servers)
          }
        }
      } catch (error) {
        debug('Falling back to default ICE configuration', error)
      }

      cleanupPeerConnection()
      peerConnection = new RTCPeerConnection(configuration)
      const video = options.videoElement()

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceMessage(event.candidate)
        }
      }

      peerConnection.ontrack = (event) => {
        debug('Remote track received', {
          streams: event.streams.length,
          tracks: event.streams[0]?.getTracks().map((track) => track.kind),
        })
        if (video) {
          video.srcObject = event.streams[0]
          video.muted = false
          video.defaultMuted = false
          video
            .play()
            .catch((error) => console.error('Failed to autoplay remote stream', error))
        }
      }

      peerConnection.onconnectionstatechange = () => {
        if (!peerConnection) return
        debug('Peer connection state', peerConnection.connectionState)
        if (peerConnection.connectionState === 'connected') {
          statusMessage.value = 'Ready'
        } else if (peerConnection.connectionState === 'failed') {
          notifyError('Media connection failed. Please retry the consultation.')
        }
      }

      await peerConnection.setRemoteDescription(offer)
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      sendAnswerMessage(peerConnection.localDescription)
    } catch (error) {
      notifyError('Unable to establish media stream.')
      console.error('Error handling WebRTC offer', error)
    }
  }

  const handleAnswer = async (message: any) => {
    if (!peerConnection || !message?.sdp) return
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
    } catch (error) {
      console.error('Failed to handle WebRTC answer', error)
    }
  }

  const handleIceCandidate = (message: any) => {
    if (!peerConnection || !message?.candidate) return
    peerConnection
      .addIceCandidate(new RTCIceCandidate(message.candidate))
      .catch((error) => console.error('Failed to add ICE candidate', error))
  }

  const toggle = () => {
    if (isActive.value) {
      stop()
    } else {
      start()
    }
  }

  const clearHistory = () => {
    chatMessages.value = []
    resetStreamingState()
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY)
    } catch (error) {
      console.warn('Unable to clear stored chat history', error)
    }
    debug('Chat history cleared')
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    isActive,
    isConnecting,
    statusMessage,
    errorMessage,
    chatMessages,
    streamingResponses,
    start,
    stop,
    toggle,
    clearHistory,
    isMicEnabled,
    toggleMicrophone,
    enableMicrophone,
    disableMicrophone,
    sendImageFrame,
  }
}

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2)
  const view = new DataView(buffer)
  let offset = 0
  for (let i = 0; i < float32Array.length; i += 1, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

function base64EncodeAudio(uint8Array: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function loadChatHistory(): ConversationMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ConversationMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Unable to load chat history', error)
    return []
  }
}

