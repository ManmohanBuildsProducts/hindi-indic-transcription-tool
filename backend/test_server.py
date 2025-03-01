import pytest
from fastapi.testclient import TestClient
from server import app
import io
import json
import time
from datetime import datetime

client = TestClient(app)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "Hindi Audio Transcription API"}

def test_test_mode_recording():
    # Create a test recording
    test_audio = io.BytesIO(b"test audio data")
    files = {"audio": ("test_recording", test_audio, "audio/webm")}
    response = client.post("/recordings", files=files)
    
    assert response.status_code == 200
    assert "recording_id" in response.json()
    assert response.json()["status"] == "processing"
    
    # Get the recording ID
    recording_id = response.json()["recording_id"]
    
    # Wait for processing (test mode should be quick)
    time.sleep(3)
    
    # Check recording status
    response = client.get(f"/recordings/{recording_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert "नमस्ते" in data["transcript"]  # Test Hindi text

def test_invalid_audio_format():
    # Try to upload with invalid format
    test_audio = io.BytesIO(b"test audio data")
    files = {"audio": ("test.mp3", test_audio, "audio/mp3")}
    response = client.post("/recordings", files=files)
    
    assert response.status_code == 415
    assert "Unsupported audio format" in response.json()["detail"]

def test_list_recordings():
    response = client.get("/recordings")
    assert response.status_code == 200
    assert "recordings" in response.json()
    recordings = response.json()["recordings"]
    assert isinstance(recordings, list)

def test_get_nonexistent_recording():
    response = client.get("/recordings/nonexistent-id")
    assert response.status_code == 404
    assert response.json()["detail"] == "Recording not found"

def test_get_recording_chunks():
    # First create a test recording
    test_audio = io.BytesIO(b"test audio data")
    files = {"audio": ("test_recording", test_audio, "audio/webm")}
    response = client.post("/recordings", files=files)
    recording_id = response.json()["recording_id"]
    
    # Get chunks
    response = client.get(f"/recordings/{recording_id}/chunks")
    assert response.status_code == 200
    assert "chunks" in response.json()

def test_real_audio_upload():
    # Create a simple WAV file with 1 second of silence
    wav_header = bytes.fromhex('52494646') + (36).to_bytes(4, 'little') + bytes.fromhex('57415645666D7420100000000100010044AC0000881301000200100064617461')
    wav_data = wav_header + bytes(1000)  # 1 second of silence
    
    test_audio = io.BytesIO(wav_data)
    files = {"audio": ("test.wav", test_audio, "audio/wav")}
    response = client.post("/recordings", files=files)
    
    assert response.status_code == 200
    assert "recording_id" in response.json()
    recording_id = response.json()["recording_id"]
    
    # Check initial status
    response = client.get(f"/recordings/{recording_id}")
    assert response.status_code == 200
    assert response.json()["status"] in ["processing", "completed"]

if __name__ == "__main__":
    pytest.main(["-v", __file__])