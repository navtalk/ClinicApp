import type { NavtalkConfig } from './composables/useNavtalkRealtime'

export const navtalkConfig: NavtalkConfig = {
  license: '',
  // Character name (e.g., navtalk.Emily, navtalk.Sophia)
  characterName: 'navtalk.Emily',
  // Avatar ID (optional, recommended for precise lookup)
  // If set, avatarId takes priority over characterName for connection
  // Leave empty to use characterName for avatar lookup
  avatarId: '',
  voice: 'marin',
  prompt:
    'You are a friendly virtual physician. Greet the patient warmly, reference their intake answers, ask thoughtful follow-ups, and provide concise, compassionate guidance with clear next steps.',
  baseUrl: 'transfer.navtalk.ai',
}
