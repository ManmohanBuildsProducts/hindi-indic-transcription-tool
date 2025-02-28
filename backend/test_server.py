import pytest
from fastapi.testclient import TestClient
from server import app
import base64
import os
import json
from datetime import datetime

client = TestClient(app)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "Hindi Audio Transcription API"}

def test_get_transcriptions():
    response = client.get("/transcriptions")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_transcribe_audio_invalid_format():
    # Create a small invalid audio file
    invalid_audio = b"invalid audio data"
    files = {"audio": ("test.txt", invalid_audio, "text/plain")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 500
    assert "Unsupported audio format" in response.json()["detail"]

def test_transcribe_audio_webm():
    # Create a small valid WebM audio file (just header)
    webm_header = b"\x1a\x45\xdf\xa3"  # Basic WebM header
    files = {"audio": ("test.webm", webm_header, "audio/webm")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 200
    result = response.json()
    assert "text" in result
    assert "timestamp" in result
    assert "duration" in result
    assert "source" in result
    assert "filename" in result

def test_transcribe_audio_wav():
    # Create a small valid WAV audio file (just header)
    wav_header = b"RIFF\x24\x00\x00\x00WAVEfmt "
    files = {"audio": ("test.wav", wav_header, "audio/wav")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 200
    result = response.json()
    assert "text" in result
    assert "timestamp" in result
    assert "duration" in result
    assert "source" in result
    assert "filename" in result

def test_transcribe_large_file():
    # Create a large file (>10MB)
    large_data = b"0" * (10 * 1024 * 1024 + 1)  # 10MB + 1 byte
    files = {"audio": ("large.wav", large_data, "audio/wav")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 500
    assert "Audio file too large" in response.json()["detail"]

if __name__ == "__main__":
    pytest.main(["-v", __file__])