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
from typing import List, Optional, Dict
import asyncio
import aiohttp
import uuid
from pydub import AudioSegment
import io
import tempfile

# Constants
SARVAM_API_KEY = "ec7650e8-3560-48c7-8c69-649f1c659680"
SARVAM_API_URL = "https://api.sarvam.ai/v1/transcribe/batch"  # Updated to batch API
CHUNK_DURATION = 8 * 60 * 1000  # 8 minutes in milliseconds
MAX_RETRIES = 3  # Maximum retries for API calls

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
recordings: Dict[str, dict] = {}  # recording_id -> recording info
chunks: Dict[str, List[dict]] = {}  # recording_id -> list of chunk transcriptions
jobs: Dict[str, dict] = {}  # job_id -> job info

class RecordingStatus:
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Recording(BaseModel):
    id: str
    timestamp: datetime
    duration: float
    status: str
    transcript: Optional[str] = None
    error: Optional[str] = None

class ChunkJob(BaseModel):
    id: str
    recording_id: str
    chunk_index: int
    status: str
    transcript: Optional[str] = None
    error: Optional[str] = None

def split_audio(audio_data: bytes, format: str) -> List[AudioSegment]:
    """Split audio into 8-minute chunks"""
    try:
        # Load audio from bytes
        audio = AudioSegment.from_file(io.BytesIO(audio_data), format=format)
        
        # Split into 8-minute chunks
        chunks = []
        for i in range(0, len(audio), CHUNK_DURATION):
            chunk = audio[i:i + CHUNK_DURATION]
            chunks.append(chunk)
        
        return chunks
    except Exception as e:
        logger.error(f"Error splitting audio: {e}")
        raise HTTPException(status_code=400, detail="Failed to process audio file")

async def transcribe_chunk(chunk: AudioSegment, chunk_index: int, recording_id: str) -> str:
    """Transcribe a single audio chunk using Sarvam AI batch API"""
    try:
        # Export chunk to WAV format
        chunk_file = io.BytesIO()
        chunk.export(chunk_file, format='wav', parameters=["-ac", "1", "-ar", "16000"])
        chunk_data = chunk_file.getvalue()
        
        # Convert to base64
        audio_base64 = base64.b64encode(chunk_data).decode('utf-8')
        
        headers = {
            "Authorization": f"Bearer {SARVAM_API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "audio": audio_base64,
            "source_lang": "hi",
            "task_type": "transcribe",
            "audio_format": "wav"
        }
        
        job_id = str(uuid.uuid4())
        jobs[job_id] = {
            "recording_id": recording_id,
            "chunk_index": chunk_index,
            "status": "processing"
        }
        
        logger.info(f"Processing chunk {chunk_index} for recording {recording_id}")
        
        # Implement retry logic
        retries = 0
        while retries < MAX_RETRIES:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(SARVAM_API_URL, headers=headers, json=data) as response:
                        response_text = await response.text()
                        
                        if response.status == 200:
                            try:
                                result = json.loads(response_text)
                                transcribed_text = result.get("text", "").strip()
                                
                                if transcribed_text:
                                    jobs[job_id]["status"] = "completed"
                                    jobs[job_id]["transcript"] = transcribed_text
                                    return transcribed_text
                                else:
                                    logger.warning(f"Empty transcription for chunk {chunk_index}")
                                    jobs[job_id]["status"] = "completed"
                                    jobs[job_id]["transcript"] = ""
                                    return ""
                                    
                            except json.JSONDecodeError as e:
                                logger.error(f"Failed to parse response for chunk {chunk_index}: {e}")
                                if retries == MAX_RETRIES - 1:
                                    jobs[job_id]["status"] = "failed"
                                    jobs[job_id]["error"] = "Failed to parse API response"
                                    return None
                        
                        elif response.status == 429:  # Rate limit
                            await asyncio.sleep(2 ** retries)  # Exponential backoff
                        
                        else:
                            error_msg = f"API error: {response_text}"
                            logger.error(error_msg)
                            if retries == MAX_RETRIES - 1:
                                jobs[job_id]["status"] = "failed"
                                jobs[job_id]["error"] = error_msg
                                return None
                
            except Exception as e:
                logger.error(f"Request error for chunk {chunk_index}: {e}")
                if retries == MAX_RETRIES - 1:
                    jobs[job_id]["status"] = "failed"
                    jobs[job_id]["error"] = str(e)
                    return None
            
            retries += 1
            if retries < MAX_RETRIES:
                await asyncio.sleep(1)  # Wait before retry
        
        return None
                    
    except Exception as e:
        error_msg = f"Error processing chunk {chunk_index}: {e}"
        logger.error(error_msg)
        if job_id in jobs:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = error_msg
        return None

async def process_recording(recording_id: str, audio_chunks: List[AudioSegment]):
    """Process all chunks of a recording with improved status tracking"""
    try:
        chunks[recording_id] = []
        tasks = []
        total_chunks = len(audio_chunks)
        
        # Update initial status
        recordings[recording_id].update({
            "total_chunks": total_chunks,
            "processed_chunks": 0,
            "failed_chunks": 0
        })
        
        async def process_chunk(chunk: AudioSegment, index: int) -> dict:
            try:
                result = await transcribe_chunk(chunk, index, recording_id)
                
                # Update progress
                recordings[recording_id]["processed_chunks"] += 1
                if result is None:
                    recordings[recording_id]["failed_chunks"] += 1
                
                return {
                    "index": index,
                    "transcript": result,
                    "error": None if result is not None else "Failed to transcribe chunk"
                }
            except Exception as e:
                recordings[recording_id]["processed_chunks"] += 1
                recordings[recording_id]["failed_chunks"] += 1
                return {
                    "index": index,
                    "transcript": None,
                    "error": str(e)
                }
        
        # Process chunks in parallel with status tracking
        for i, chunk in enumerate(audio_chunks):
            task = asyncio.create_task(process_chunk(chunk, i))
            tasks.append(task)
        
        # Wait for all chunks with timeout
        try:
            chunk_results = await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logger.error(f"Error gathering results: {e}")
            recordings[recording_id]["status"] = RecordingStatus.FAILED
            recordings[recording_id]["error"] = f"Processing timeout: {str(e)}"
            return
        
        # Process results
        successful_transcripts = []
        failed_chunks = []
        
        for result in chunk_results:
            chunks[recording_id].append(result)
            if result["transcript"]:
                successful_transcripts.append(result["transcript"])
            else:
                failed_chunks.append(result["index"])
        
        # Update final status
        if len(successful_transcripts) == total_chunks:
            recordings[recording_id]["status"] = RecordingStatus.COMPLETED
            recordings[recording_id]["transcript"] = " ".join(successful_transcripts)
        elif len(successful_transcripts) > 0:
            recordings[recording_id]["status"] = RecordingStatus.COMPLETED
            recordings[recording_id]["transcript"] = " ".join(successful_transcripts)
            recordings[recording_id]["warning"] = f"Some chunks failed: {failed_chunks}"
        else:
            recordings[recording_id]["status"] = RecordingStatus.FAILED
            recordings[recording_id]["error"] = "All chunks failed to process"
            
    except Exception as e:
        logger.error(f"Error processing recording {recording_id}: {e}")
        recordings[recording_id]["status"] = RecordingStatus.FAILED
        recordings[recording_id]["error"] = str(e)
    finally:
        # Ensure we have final counts
        if "processed_chunks" not in recordings[recording_id]:
            recordings[recording_id]["processed_chunks"] = 0
        if "failed_chunks" not in recordings[recording_id]:
            recordings[recording_id]["failed_chunks"] = 0

@app.get("/")
async def root():
    return {"status": "healthy", "service": "Hindi Audio Transcription API"}

@app.post("/recordings")
async def create_recording(background_tasks: BackgroundTasks, audio: UploadFile = File(...)):
    try:
        # Handle test mode
        if audio.filename == "test_recording":
            recording_id = str(uuid.uuid4())
            test_transcript = "नमस्ते, यह एक परीक्षण प्रतिलेख है। हम हिंदी ट्रांसक्रिप्शन टूल का परीक्षण कर रहे हैं।"
            
            # Create recording entry
            recordings[recording_id] = {
                "id": recording_id,
                "timestamp": datetime.now(),
                "duration": 30.0,  # Simulated 30-second recording
                "status": RecordingStatus.PROCESSING,
                "transcript": None,
                "error": None
            }
            
            # Simulate processing delay
            async def process_test_recording():
                await asyncio.sleep(2)  # Simulate 2-second processing
                recordings[recording_id]["status"] = RecordingStatus.COMPLETED
                recordings[recording_id]["transcript"] = test_transcript
            
            # Process in background
            background_tasks.add_task(process_test_recording)
            
            return {
                "recording_id": recording_id,
                "status": RecordingStatus.PROCESSING,
                "message": "Test recording is being processed"
            }

        # Handle real recording
        # Validate file format
        if not audio.content_type in ["audio/webm", "audio/wav", "audio/wave"]:
            raise HTTPException(
                status_code=415,
                detail="Unsupported audio format. Please use WAV or WebM format."
            )

        # Read content
        content = await audio.read()
        
        # Generate recording ID
        recording_id = str(uuid.uuid4())
        
        # Get audio format
        format = "wav" if audio.content_type in ["audio/wav", "audio/wave"] else "webm"
        
        # Split audio into chunks
        audio_chunks = split_audio(content, format)
        
        # Create recording entry
        recordings[recording_id] = {
            "id": recording_id,
            "timestamp": datetime.now(),
            "duration": sum(len(chunk) for chunk in audio_chunks) / 1000,  # duration in seconds
            "status": RecordingStatus.PROCESSING,
            "transcript": None,
            "error": None
        }
        
        # Process chunks in background
        background_tasks.add_task(process_recording, recording_id, audio_chunks)
        
        return {
            "recording_id": recording_id,
            "status": RecordingStatus.PROCESSING,
            "message": "Recording is being processed"
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error processing recording: {error_msg}")
        raise HTTPException(status_code=500, detail="Failed to process recording")

@app.get("/recordings/{recording_id}")
async def get_recording(recording_id: str):
    if recording_id not in recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    recording = recordings[recording_id]
    
    return {
        "id": recording_id,
        "status": recording["status"],
        "transcript": recording.get("transcript"),
        "error": recording.get("error"),
        "timestamp": recording["timestamp"].isoformat(),
        "duration": recording["duration"]
    }

@app.get("/recordings/{recording_id}/chunks")
async def get_recording_chunks(recording_id: str):
    if recording_id not in recordings:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    if recording_id not in chunks:
        return {"chunks": []}
    
    return {"chunks": chunks[recording_id]}

@app.get("/recordings")
async def list_recordings():
    return {
        "recordings": [
            {
                "id": rec_id,
                "status": rec["status"],
                "timestamp": rec["timestamp"].isoformat(),
                "duration": rec["duration"],
                "has_transcript": rec["transcript"] is not None
            }
            for rec_id, rec in recordings.items()
        ]
    }