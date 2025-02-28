from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import os
import logging
from pathlib import Path
import json
from typing import List

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
        # Save the audio chunk temporarily
        chunk_path = f"/tmp/{audio.filename}"
        with open(chunk_path, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)
        
        # TODO: Integrate with Sarvam AI API here
        # For now, return mock response
        result = {
            "text": "Sample Hindi transcription",
            "timestamp": datetime.now().isoformat(),
            "duration": 8.0,
            "source": "microphone"
        }
        
        # Store in memory
        transcriptions_store.append(result)
        
        # Cleanup
        os.remove(chunk_path)
        
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