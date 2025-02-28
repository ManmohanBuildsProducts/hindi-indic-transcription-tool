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
        # Read audio content
        content = await audio.read()
        
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
        
        # Only store non-error transcriptions
        if not transcribed_text.startswith("Error"):
            transcriptions_store.append(result)
        
        return result
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing audio: {error_msg}")
        
        # Return a more user-friendly error
        if "413" in error_msg:
            error_msg = "Audio file too large. Please use shorter recordings."
        elif "415" in error_msg:
            error_msg = "Unsupported audio format. Please use WAV or WebM format."
            
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/transcriptions")
async def get_transcriptions():
    try:
        return sorted(transcriptions_store, key=lambda x: x["timestamp"], reverse=True)
    except Exception as e:
        logger.error(f"Error fetching transcriptions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))