import requests
import pytest
import io
import os

BASE_URL = "http://localhost:55285"

def test_health_check():
    """Test the root endpoint health check"""
    response = requests.get(f"{BASE_URL}/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Hindi Audio Transcription API"
    print("✅ Health check endpoint working")

def test_get_transcriptions():
    """Test getting transcriptions list"""
    response = requests.get(f"{BASE_URL}/transcriptions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print("✅ Transcriptions list endpoint working")

def test_file_size_validation():
    """Test file size validation (>10MB file)"""
    # Create a mock audio file larger than 10MB
    large_file_size = 11 * 1024 * 1024  # 11MB
    mock_large_audio = io.BytesIO(b"0" * large_file_size)
    files = {"audio": ("large_audio.webm", mock_large_audio, "audio/webm")}
    
    response = requests.post(f"{BASE_URL}/transcribe", files=files)
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()
    print("✅ File size validation working")

def test_invalid_format():
    """Test format validation"""
    mock_audio = io.BytesIO(b"invalid audio data")
    files = {"audio": ("test.mp3", mock_audio, "audio/mp3")}
    
    response = requests.post(f"{BASE_URL}/transcribe", files=files)
    assert response.status_code == 415
    assert "unsupported" in response.json()["detail"].lower()
    print("✅ Format validation working")

def test_valid_audio_transcription():
    """Test transcription with valid audio file"""
    # Create a small valid WebM audio file
    mock_audio = io.BytesIO(b"valid audio content")
    files = {"audio": ("test_audio.webm", mock_audio, "audio/webm")}
    
    response = requests.post(f"{BASE_URL}/transcribe", files=files)
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    assert "text" in data
    assert "timestamp" in data
    assert "duration" in data
    assert "source" in data
    assert "filename" in data
    print("✅ Valid audio transcription working")

def test_empty_audio():
    """Test transcription with empty audio"""
    mock_audio = io.BytesIO(b"")
    files = {"audio": ("empty.webm", mock_audio, "audio/webm")}
    
    response = requests.post(f"{BASE_URL}/transcribe", files=files)
    data = response.json()
    assert "text" in data
    print("✅ Empty audio handling working")

def run_all_tests():
    """Run all tests and print summary"""
    print("\n🔍 Starting Backend API Tests...\n")
    
    try:
        test_health_check()
        test_get_transcriptions()
        test_file_size_validation()
        test_invalid_format()
        test_valid_audio_transcription()
        test_empty_audio()
        
        print("\n✨ All backend tests completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        raise e

if __name__ == "__main__":
    run_all_tests()