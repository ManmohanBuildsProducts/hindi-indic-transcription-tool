# Hindi Transcription Tool - Technical Plan

## Problem Analysis & Purpose
A desktop application primarily for Mac users to transcribe Hindi audio from Slack huddles and browser calls. The tool focuses on seamless system audio capture, efficient chunking of long recordings (1-2 hours), and integration with Sarvam AI for accurate Hindi transcription.

## Core Features
- System-level audio capture for Slack huddles (90% use case) and browser calls (10%)
- Automatic audio chunking into 8-minute segments for API compatibility
- Hindi transcription using Sarvam AI batch API
- Local transcript storage with search and navigation
- Standout Feature: "Smart Context" - Maintains conversation context across 8-minute chunks using GPT-4, ensuring seamless transcript flow despite chunked processing

## UI Design Focus
- Clean, minimal Electron interface with native Mac feel
- Audio recording status with chunk progress indicator
- Transcript viewer with timestamp navigation and chunk markers
- Simple recording controls (Start/Stop/Pause)
- Settings panel for API keys and preferences
- Dark/Light mode following system preferences

## MVP Implementation Strategy
1. Setup Electron.js project with React frontend (2 days)
2. Implement Mac system audio capture module (2 days)
3. Build audio chunking and processing pipeline (2 days)
4. Integrate Sarvam AI API for transcription (1 day)
5. Create local storage and transcript viewer (2 days)
6. Add GPT-4 integration for context maintenance (1 day)
7. Polish UI/UX and testing (2 days)

## Development Approach
- Initial setup using files_writer (< 200 lines)
- Switch to str_replace_editor for complex components
- Multiple file structure for better organization

## File Structure
```
src/
  /electron
    - main.js
    - preload.js
  /frontend
    - App.tsx
    - components/
    - styles/
  /backend
    - audioCapture.ts
    - chunking.ts
    - transcription.ts
    - storage.ts
  /shared
    - types.ts
    - utils.ts
```

<Clarification Required>
1. Sarvam AI API key and documentation access
2. Specific Mac OS version support requirements
3. OpenAI API key for GPT-4 integration
4. Any specific Slack huddle API/SDK requirements
5. Local storage format preference (SQLite/JSON/Plain text)