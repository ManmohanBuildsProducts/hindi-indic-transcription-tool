import requests
import pytest
import io

BASE_URL = "http://localhost:55285"

def test_health_check():
    """Test the root endpoint health check"""
    response = requests.get(f"{BASE_URL}/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Hindi Audio Transcription API"

def test_get_transcriptions():
    """Test getting transcriptions list"""
    response = requests.get(f"{BASE_URL}/transcriptions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_transcribe_audio():
    """Test audio transcription endpoint with mock audio"""
    # Create a mock audio file
    mock_audio = io.BytesIO(b"mock audio data")
    files = {"audio": ("test_audio.webm", mock_audio, "audio/webm")}
    
    response = requests.post(f"{BASE_URL}/transcribe", files=files)
    assert response.status_code == 200
    data = response.json()
    
    # Check response structure
    assert "text" in data
    assert "timestamp" in data
    assert "duration" in data
    assert "source" in data

if __name__ == "__main__":
    # Run the tests
    pytest.main([__file__, "-v"])