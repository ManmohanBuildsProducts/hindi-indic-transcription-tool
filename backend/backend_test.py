import pytest
import requests
import json
import time
import io
import wave
import numpy as np
from datetime import datetime

BASE_URL = "http://localhost:55285"

def create_test_wav():
    """Create a test WAV file with 1 second of audio"""
    samplerate = 16000
    duration = 1  # seconds
    t = np.linspace(0, duration, int(samplerate * duration))
    data = np.sin(2 * np.pi * 440 * t)  # 440 Hz sine wave
    scaled = np.int16(data * 32767)
    
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(samplerate)
        wav.writeframes(scaled.tobytes())
    
    return buffer.getvalue()

def test_health_check():
    """Test the health check endpoint"""
    response = requests.get(f"{BASE_URL}/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Hindi Audio Transcription API"

def test_create_recording():
    """Test creating a new recording"""
    # Create test audio file
    audio_data = create_test_wav()
    files = {'audio': ('test.wav', audio_data, 'audio/wav')}
    
    response = requests.post(f"{BASE_URL}/recordings", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "recording_id" in data
    assert data["status"] == "processing"
    
    return data["recording_id"]

def test_get_recording(recording_id):
    """Test getting a specific recording"""
    # Wait for processing to complete (max 10 seconds)
    for _ in range(10):
        response = requests.get(f"{BASE_URL}/recordings/{recording_id}")
        assert response.status_code == 200
        data = response.json()
        
        if data["status"] in ["completed", "failed"]:
            break
        time.sleep(1)
    
    assert "id" in data
    assert "status" in data
    assert "timestamp" in data
    assert "duration" in data

def test_get_recording_chunks(recording_id):
    """Test getting chunks for a recording"""
    response = requests.get(f"{BASE_URL}/recordings/{recording_id}/chunks")
    assert response.status_code == 200
    data = response.json()
    assert "chunks" in data

def test_list_recordings():
    """Test listing all recordings"""
    response = requests.get(f"{BASE_URL}/recordings")
    assert response.status_code == 200
    data = response.json()
    assert "recordings" in data
    assert isinstance(data["recordings"], list)

def test_invalid_recording_id():
    """Test getting a non-existent recording"""
    response = requests.get(f"{BASE_URL}/recordings/invalid-id")
    assert response.status_code == 404

def test_invalid_audio_format():
    """Test uploading an invalid audio format"""
    files = {'audio': ('test.txt', b'invalid audio data', 'text/plain')}
    response = requests.post(f"{BASE_URL}/recordings", files=files)
    assert response.status_code == 415

if __name__ == "__main__":
    # Run all tests
    print("Running API tests...")
    
    try:
        test_health_check()
        print("✅ Health check test passed")
        
        recording_id = test_create_recording()
        print("✅ Create recording test passed")
        
        test_get_recording(recording_id)
        print("✅ Get recording test passed")
        
        test_get_recording_chunks(recording_id)
        print("✅ Get recording chunks test passed")
        
        test_list_recordings()
        print("✅ List recordings test passed")
        
        test_invalid_recording_id()
        print("✅ Invalid recording ID test passed")
        
        test_invalid_audio_format()
        print("✅ Invalid audio format test passed")
        
        print("\n🎉 All tests passed successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
