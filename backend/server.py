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

async def transcribe_with_sarvam(audio_data: bytes) -> str:
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
            "task": "transcribe"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(SARVAM_API_URL, headers=headers, json=data) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"Sarvam API error: {error_text}")
                    return "Error in transcription"
                
                result = await response.json()
                return result.get("text", "No transcription available")
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
        transcribed_text = await transcribe_with_sarvam(content)
        
        # Create result
        result = {
            "text": transcribed_text,
            "timestamp": datetime.now().isoformat(),
            "duration": 8.0,  # Assuming 8-minute chunks
            "source": "microphone"
        }
        
        # Store in memory
        transcriptions_store.append(result)
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/transcriptions")
async def get_transcriptions():
    try:
        return sorted(transcriptions_store, key=lambda x: x["timestamp"], reverse=True)
    except Exception as e:
        logger.error(f"Error fetching transcriptions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))