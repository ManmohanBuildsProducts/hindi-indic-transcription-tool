# Hindi Audio Transcription Tool - Technical Plan

## <Clarification Required>
1. Does the user have Sarvam AI API credentials? Need API key and endpoint details.
2. Should the tool run as a system tray application or a regular window application?
3. For audio capture, should we provide manual start/stop controls or auto-detect Slack huddles?
4. Preferred format for transcription storage - JSON/TXT/Both?
5. Any specific UI theme preferences (Light/Dark/System)?

## Problem Analysis & Purpose
A desktop application primarily for Mac users to capture and transcribe Hindi audio from Slack huddles and microphone input. The tool focuses on seamless audio capture, efficient chunked processing via Sarvam AI, and organized storage of transcriptions for future analysis.

## Core Features
- System tray application with minimal UI footprint
- Unified audio capture (both system audio and microphone)
- Smart chunking system with progress indication
- Real-time transcription preview
- Standout Feature: "Smart Context Preservation" - Maintains semantic continuity across 8-minute chunks by intelligent overlap processing
- Searchable transcription history with audio timestamp linking
- Export functionality (JSON/TXT) with metadata
- Simple one-click recording controls

## Technical Architecture
This application requires a multi-file structure due to its complexity:

Backend (Python):
- main.py (Core application)
- audio_capture.py (Audio handling)
- transcription_service.py (Sarvam AI integration)
- storage_manager.py (File operations)
- chunk_processor.py (Audio chunking)

Frontend (Electron + React):
- src/
  - components/ (UI components)
  - services/ (Frontend services)
  - styles/ (CSS modules)
- public/ (Static assets)

## MVP Implementation Strategy
1. Setup Development Environment (Day 1)
   - Initialize Electron + React project
   - Setup Python backend structure
   - Configure inter-process communication

2. Core Audio Capture (Days 2-3)
   - Implement system audio capture
   - Add microphone input handling
   - Create audio chunking system

3. Transcription Integration (Days 3-4)
   - Integrate Sarvam AI API
   - Implement chunk processing
   - Add progress tracking

4. UI Development (Days 5-6)
   - Create minimal system tray interface
   - Build main application window
   - Implement real-time preview
   - Add transcription history view

5. Storage & Export (Day 7)
   - Implement local storage system
   - Add export functionality
   - Create search interface

6. Testing & Polish (Day 8)
   - End-to-end testing
   - UI refinements
   - Performance optimization

## Development Approach
- Use files_writer for initial setup and simple components (< 100 lines)
- Switch to str_replace_editor for complex components and iterative development
- Implement features incrementally with continuous testing

## UI/UX Focus
- Clean, modern interface with system-native feel
- Dark/Light theme support
- Minimal controls with clear visual feedback
- Progress indicators for long-running operations
- Intuitive history browsing

## External Integrations
- Sarvam AI API for transcription
- System audio capture libraries
- Local storage system