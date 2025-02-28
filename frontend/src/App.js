import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unchecked'); // 'unchecked' | 'available' | 'unavailable'
  const [isTestMode, setIsTestMode] = useState(false);
  const mediaRecorder = useRef(null);
  const chunkInterval = useRef(null);
  
  // Test mode toggle
  const toggleTestMode = () => {
    setIsTestMode(!isTestMode);
    setDeviceStatus(isTestMode ? 'unchecked' : 'available');
    setError(null);
  };

  useEffect(() => {
    // Load existing transcriptions
    fetchTranscriptions();
    
    // Check for audio device availability
    checkAudioDevice();
  }, []);

  const checkAudioDevice = async () => {
    try {
      // First request permission
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stop the stream immediately
          stream.getTracks().forEach(track => track.stop());
          setDeviceStatus('available');
          setError(null);
        })
        .catch(err => {
          console.error('Permission error:', err);
          setDeviceStatus('unavailable');
          setError('Microphone permission denied. Please allow microphone access.');
          return false;
        });

      // Then check available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudioDevice = devices.some(device => device.kind === 'audioinput');
      
      if (!hasAudioDevice) {
        setDeviceStatus('unavailable');
        setError('No audio input device found. Please connect a microphone.');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Device check error:', err);
      setDeviceStatus('unavailable');
      setError('Could not access audio devices. Please check permissions.');
      return false;
    }
  };

  const fetchTranscriptions = async () => {
    try {
      const response = await fetch('http://localhost:55285/transcriptions');
      const data = await response.json();
      setTranscriptions(data);
    } catch (error) {
      console.error('Error fetching transcriptions:', error);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      if (isTestMode) {
        // Simulate recording in test mode
        setIsRecording(true);
        
        // Simulate chunks every 8 minutes
        chunkInterval.current = setInterval(() => {
          const testAudioBlob = new Blob(['Test audio data'], { type: 'audio/webm' });
          setAudioChunks(chunks => [...chunks, testAudioBlob]);
        }, 8 * 60 * 1000); // 8 minutes
        
        // Simulate first chunk immediately
        const initialTestBlob = new Blob(['Initial test audio data'], { type: 'audio/webm' });
        setAudioChunks(chunks => [...chunks, initialTestBlob]);
        
        return;
      }
      
      // Normal recording mode
      if (deviceStatus !== 'available') {
        const deviceAvailable = await checkAudioDevice();
        if (!deviceAvailable) {
          throw new Error('Audio device not available');
        }
      }

      // Get audio stream with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Find supported MIME type
      const mimeTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/wav'
      ];
      
      const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      
      if (!selectedMimeType) {
        throw new Error('No supported audio format found. Please use a modern browser.');
      }
      
      // Create MediaRecorder with optimal settings
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 32000 // 32kbps for good quality speech
      });
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(chunks => [...chunks, event.data]);
        }
      };

      mediaRecorder.current.onerror = (event) => {
        setError('Recording error: ' + event.error.message);
        stopRecording();
      };

      mediaRecorder.current.start(1000); // Capture every second for smoother experience
      setIsRecording(true);

      // Create 8-minute chunks
      chunkInterval.current = setInterval(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          mediaRecorder.current.stop();
          mediaRecorder.current.start(1000);
        }
      }, 8 * 60 * 1000); // 8 minutes in milliseconds

    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError(error.message || 'Error accessing microphone');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (isTestMode) {
      clearInterval(chunkInterval.current);
      setIsRecording(false);
      return;
    }
    
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      clearInterval(chunkInterval.current);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  const uploadChunk = async (chunk) => {
    try {
      // Create a unique filename with timestamp
      const timestamp = new Date().getTime();
      const extension = chunk.type.includes('webm') ? 'webm' : 'wav';
      const filename = `audio-chunk-${timestamp}.${extension}`;
      
      // Check file size before uploading
      if (chunk.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('Audio chunk too large. Maximum size is 10MB.');
      }
      
      const formData = new FormData();
      formData.append('audio', chunk, filename);

      const response = await fetch('http://localhost:55285/transcribe', {
        method: 'POST',
        body: formData,
      });

      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { detail: 'Failed to parse server response' };
      }

      if (!response.ok) {
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      // Handle successful response
      if (errorData.text && errorData.text.trim()) {
        if (errorData.text.startsWith('Error') || errorData.text.startsWith('No speech')) {
          console.warn('Transcription issue:', errorData.text);
          return;
        }

        // Update transcriptions with new entry
        setTranscriptions(prev => [{
          ...errorData,
          timestamp: new Date(errorData.timestamp).toISOString(),
          filename: filename
        }, ...prev]);

        // Clear error if successful
        setError(null);
      }
    } catch (error) {
      console.error('Error uploading chunk:', error);
      
      // Handle specific error cases
      let errorMessage = error.message;
      if (errorMessage.includes('too large')) {
        errorMessage = 'Recording chunk too large. Please use shorter recordings.';
      } else if (errorMessage.includes('format')) {
        errorMessage = 'Unsupported audio format. Please use a different browser.';
      } else if (errorMessage.includes('API')) {
        errorMessage = 'Transcription service error. Please try again later.';
      }
      
      setError(errorMessage);
      return null;
    }
  };

  // Process audio chunks
  useEffect(() => {
    const processChunk = async () => {
      if (audioChunks.length > 0) {
        const lastChunk = audioChunks[audioChunks.length - 1];
        if (lastChunk.size > 0) {
          await uploadChunk(lastChunk);
        }
      }
    };

    processChunk();
  }, [audioChunks]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Hindi Audio Transcription Tool</h1>
          <p className="text-gray-600 mt-2">Record and transcribe Hindi audio in real-time</p>
          
          {/* Test Mode Toggle */}
          <div className="mt-4">
            <button
              onClick={toggleTestMode}
              className="text-sm px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              {isTestMode ? 'Exit Test Mode' : 'Enter Test Mode'}
            </button>
            {isTestMode && (
              <p className="text-xs text-gray-500 mt-2">
                Test mode enabled. Recording simulation active.
              </p>
            )}
          </div>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          {/* Device Status Indicator */}
          <div className="flex items-center justify-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              isTestMode ? 'bg-yellow-500' :
              deviceStatus === 'available' ? 'bg-green-500' :
              deviceStatus === 'unavailable' ? 'bg-red-500' :
              'bg-yellow-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {isTestMode ? 'Test Mode Active' :
               deviceStatus === 'available' ? 'Microphone Ready' :
               deviceStatus === 'unavailable' ? 'No Microphone' :
               'Checking Device...'}
            </span>
          </div>

          {/* Error Message */}
          {error && !isTestMode && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="flex justify-center mb-6">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isTestMode && deviceStatus !== 'available'}
              className={`px-6 py-3 rounded-full font-semibold text-white ${
                !isTestMode && deviceStatus !== 'available'
                  ? 'bg-gray-400 cursor-not-allowed' 
                : isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>

          {isRecording && (
            <div className="text-center text-sm text-gray-600">
              <div className="recording-indicator inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></div>
              {isTestMode ? 'Test recording in progress...' : 'Recording in progress... Audio will be processed in 8-minute chunks'}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Transcriptions</h2>
          <div className="space-y-4">
            {transcriptions.map((trans, index) => (
              <div key={index} className="border-b pb-4">
                <p className="text-gray-800">{trans.text}</p>
                <div className="text-sm text-gray-500 mt-2">
                  {new Date(trans.timestamp).toLocaleString()} - Duration: {trans.duration}s
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;