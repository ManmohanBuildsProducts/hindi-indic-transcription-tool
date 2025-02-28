from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import os
import logging
from pathlib import Path
import json
import requests
import base64
from typing import List, Optional
import asyncio
import aiohttp
from typing import List

# Constants
SARVAM_API_KEY = "ec7650e8-3560-48c7-8c69-649f1c659680"
SARVAM_API_URL = "https://api.sarvam.ai/v1/transcribe"
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10MB limit

# Initialize FastAPI app
app = FastAPI(title="Hindi Audio Transcription API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# In-memory storage
transcriptions_store: List[dict] = []

class TranscriptionRequest(BaseModel):
    audio_base64: str
    language: str = "hi"
    task: str = "transcribe"

async def transcribe_with_sarvam(audio_data: bytes, filename: str) -> str:
    try:
        # Convert audio to base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        headers = {
            "Authorization": f"Bearer {SARVAM_API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "audio_base64": audio_base64,
            "language": "hi",
            "task": "transcribe",
            "format": "wav" if filename.endswith('.wav') else "webm"
        }
        
        logger.info(f"Sending transcription request for {filename}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(SARVAM_API_URL, headers=headers, json=data) as response:
                response_text = await response.text()
                
                if response.status != 200:
                    logger.error(f"Sarvam API error: {response_text}")
                    return f"Error in transcription: {response_text}"
                
                try:
                    result = json.loads(response_text)
                    transcribed_text = result.get("text", "").strip()
                    
                    if not transcribed_text:
                        logger.warning(f"Empty transcription received for {filename}")
                        return "No speech detected"
                        
                    return transcribed_text
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse Sarvam API response: {e}")
                    return "Error parsing transcription result"
    except Exception as e:
        logger.error(f"Error in Sarvam transcription: {str(e)}")
        return f"Error in transcription: {str(e)}"

class TranscriptionResult(BaseModel):
    text: str
    timestamp: datetime
    duration: float
    source: str

@app.get("/")
async def root():
    return {"status": "healthy", "service": "Hindi Audio Transcription API"}

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    try:
        # Validate file format
        if not audio.content_type in ["audio/webm", "audio/wav", "audio/wave"]:
            raise HTTPException(
                status_code=415,
                detail="Unsupported audio format. Please use WAV or WebM format."
            )

        # Read content for size validation
        content = await audio.read()
        
        # Validate file size
        if len(content) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Audio file too large. Please use shorter recordings (max 10MB)."
            )
        
        # Get transcription from Sarvam AI
        transcribed_text = await transcribe_with_sarvam(content, audio.filename)
        
        # Calculate duration from content length (rough estimate)
        # Assuming 32kbps audio rate
        duration = len(content) / (32 * 1024 / 8)  # in seconds
        
        # Create result
        result = {
            "text": transcribed_text,
            "timestamp": datetime.now().isoformat(),
            "duration": round(duration, 2),
            "source": "microphone",
            "filename": audio.filename
        }
        
        # Only store successful transcriptions
        if not transcribed_text.startswith(("Error", "No speech")):
            transcriptions_store.append(result)
            logger.info(f"Successfully transcribed {audio.filename}")
        else:
            logger.warning(f"Transcription failed for {audio.filename}: {transcribed_text}")
        
        return result
        
    except HTTPException as he:
        raise he
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing audio: {error_msg}")
        
        if "not authorized" in error_msg.lower():
            error_msg = "API authentication failed. Please check API key."
        elif "timeout" in error_msg.lower():
            error_msg = "Transcription service timeout. Please try again."
        else:
            error_msg = "Failed to process audio. Please try again."
            
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/transcriptions")
async def get_transcriptions():
    try:
        return sorted(transcriptions_store, key=lambda x: x["timestamp"], reverse=True)
    except Exception as e:
        logger.error(f"Error fetching transcriptions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))