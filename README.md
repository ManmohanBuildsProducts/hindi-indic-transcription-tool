# Hindi Audio Transcription Tool

A web-based tool for transcribing Hindi audio using Sarvam AI's API.

## Features
- Record audio from microphone or system audio
- Process long recordings in chunks
- Real-time transcription with Sarvam AI
- Progress tracking and status updates
- Copy and export transcriptions

## Local Development Setup

### Prerequisites
- Node.js (v16 or higher)
- Python 3.11 or higher
- FFmpeg (for audio processing)
- Poetry (Python package manager)

### Backend Setup
1. Install FFmpeg:
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

2. Install Python dependencies:
```bash
cd backend
poetry install
```

3. Create .env file:
```bash
echo "SARVAM_API_KEY=ec7650e8-3560-48c7-8c69-649f1c659680" > .env
```

4. Start backend server:
```bash
poetry run uvicorn server:app --host 0.0.0.0 --port 55285 --reload
```

### Frontend Setup
1. Install dependencies:
```bash
cd frontend
yarn install
```

2. Start development server:
```bash
yarn start
```

The app will be available at:
- Frontend: http://localhost:55821
- Backend API: http://localhost:55285

## Testing
1. Open http://localhost:55821 in your browser
2. Allow microphone access when prompted
3. Select audio source (Microphone/System)
4. Click "Start Recording" and speak in Hindi
5. Click "Stop Recording" to process
6. View transcription in the list below

## API Endpoints

### POST /recordings
Upload audio for transcription
```bash
curl -X POST "http://localhost:55285/recordings" \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@recording.wav;type=audio/wav" \
  -F "source=microphone"
```

### GET /recordings/{recording_id}
Get recording status and transcription
```bash
curl "http://localhost:55285/recordings/[recording-id]"
```

### GET /recordings
List all recordings
```bash
curl "http://localhost:55285/recordings"
```

## Troubleshooting

### Microphone Issues
1. Check browser permissions
2. Verify microphone is not in use by another application
3. Try a different browser (Chrome recommended)

### Audio Processing Issues
1. Ensure FFmpeg is installed
2. Check audio format (WAV or WebM supported)
3. Verify file is not empty
4. Check Sarvam AI API key

### System Audio Capture
Currently supported through browser's audio capture API. For better system audio capture:
1. Use virtual audio cable software
2. Route system audio to virtual microphone
3. Select virtual microphone in the app

## Contributing
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request