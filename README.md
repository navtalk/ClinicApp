# NavTalk ClinicApp

AI-powered virtual physician assistant demo using NavTalk's real-time digital human technology. Provides patient intake, consultation, and guidance with live video interaction.

## Getting Started

```bash
cd ClinicApp
npm install
# Configure your NavTalk credentials in src/navtalk.ts
npm run dev
```

The dev server runs on <http://localhost:5173>.

### Configuration

Edit `src/navtalk.ts` to configure the NavTalk connection:

```typescript
export const navtalkConfig: NavtalkConfig = {
  license: '',              // Your NavTalk license key
  characterName: 'navtalk.Emily',  // Character name (fallback if avatarId not set)
  avatarId: '',            // (Optional, Recommended) Avatar ID for precise lookup
  voice: 'marin',          // Voice preset
  prompt: '...',           // System prompt for the virtual physician
  baseUrl: 'transfer.navtalk.ai',
}
```

> **Connection Priority:** The system will use `avatarId` if provided, otherwise falls back to `characterName`. This allows precise avatar selection while maintaining backward compatibility.

> The browser will request microphone and camera permissions the first time you start a NavTalk session.

## Project Structure

- `src/navtalk.ts` – NavTalk configuration
- `src/composables/useNavtalkRealtime.ts` – Core WebSocket + WebRTC integration
- `src/views` – Main application views
- `src/components` – UI components

## Features

- Real-time video consultation with AI physician
- Patient intake form integration
- Speech-to-text transcription
- Natural medical conversation handling
- Warm, professional interaction style

## Building for Production

```bash
npm run build    # type-checks and builds
npm run preview  # preview production build locally
```
