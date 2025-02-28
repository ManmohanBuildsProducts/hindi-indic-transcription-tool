import unittest
import os
import json
from unittest.mock import patch, MagicMock
from src.electron.sarvamAPI import SarvamAPI

class TestSarvamAPI(unittest.TestCase):
    def setUp(self):
        self.api_key = "test_api_key"
        self.api = SarvamAPI(self.api_key)
        self.test_audio_path = "/tmp/test_audio.webm"
        
        # Create a dummy audio file
        with open(self.test_audio_path, "wb") as f:
            f.write(b"dummy audio data")

    def tearDown(self):
        if os.path.exists(self.test_audio_path):
            os.remove(self.test_audio_path)

    @patch('axios.post')
    def test_transcribe_audio_success(self, mock_post):
        # Mock successful API response
        mock_response = MagicMock()
        mock_response.data = {"text": "नमस्ते दुनिया"}
        mock_post.return_value = mock_response

        result = self.api.transcribeAudio(self.test_audio_path)
        self.assertEqual(result, "नमस्ते दुनिया")
        
        # Verify API call
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://api.sarvam.ai/v1/audio/transcribe")
        self.assertEqual(kwargs["headers"]["Authorization"], f"Bearer {self.api_key}")

    @patch('axios.post')
    def test_transcribe_audio_failure(self, mock_post):
        # Mock API error
        mock_post.side_effect = Exception("API Error")

        with self.assertRaises(Exception):
            self.api.transcribeAudio(self.test_audio_path)

    def test_transcribe_invalid_file(self):
        with self.assertRaises(Exception):
            self.api.transcribeAudio("/nonexistent/file.webm")

if __name__ == '__main__':
    unittest.main()