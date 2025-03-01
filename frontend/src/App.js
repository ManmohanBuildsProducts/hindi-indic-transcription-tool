import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unchecked');
  const [isTestMode, setIsTestMode] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  useEffect(() => {
    // Load existing recordings
    fetchRecordings();
    // Check device status
    checkAudioDevice();
  }, []);

  const fetchRecordings = async () => {
    try {
      const response = await fetch('http://localhost:55285/recordings');
      const data = await response.json();
      setRecordings(data.recordings);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setError('Failed to load recordings');
    }
  };

  const checkAudioDevice = async () => {
    try {
      // First request permission
      await navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          stream.getTracks().forEach(track => track.stop());
          setDeviceStatus('available');
          setError(null);
        })
        .catch(err => {
          console.error('Permission error:', err);
          setDeviceStatus('unavailable');
          setError('Microphone permission denied. Please allow microphone access.');
        });
    } catch (err) {
      console.error('Device check error:', err);
      setDeviceStatus('unavailable');
      setError('Could not access audio devices. Please check permissions.');
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      audioChunks.current = [];
      
      if (isTestMode) {
        setIsRecording(true);
        return;
      }
      
      if (deviceStatus !== 'available') {
        const deviceAvailable = await checkAudioDevice();
        if (!deviceAvailable) {
          throw new Error('Audio device not available');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/wav';
      
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 32000
      });
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.start(1000); // Capture every second
      setIsRecording(true);

    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message || 'Error starting recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (isTestMode) {
        setIsRecording(false);
        // Create test recording with proper FormData
        const formData = new FormData();
        const testBlob = new Blob(['test audio data'], { type: 'audio/webm' });
        formData.append('audio', testBlob, 'test_recording');
        
        const response = await fetch('http://localhost:55285/recordings', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Failed to process test recording');
        }
        
        const result = await response.json();
        setRecordingId(result.recording_id);
        await fetchRecordings();  // Refresh recordings list
        return;
      }

      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
        mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        
        // Create a single blob from all chunks
        const audioBlob = new Blob(audioChunks.current, { 
          type: mediaRecorder.current.mimeType 
        });
        
        // Upload the complete recording
        const formData = new FormData();
        formData.append('audio', audioBlob);
        
        const response = await fetch('http://localhost:55285/recordings', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Failed to upload recording');
        }
        
        const result = await response.json();
        setRecordingId(result.recording_id);
        
        // Clear recording state
        setIsRecording(false);
        audioChunks.current = [];
        
        // Refresh recordings list
        fetchRecordings();
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(error.message || 'Error stopping recording');
      setIsRecording(false);
    }
  };

  const toggleTestMode = () => {
    setIsTestMode(!isTestMode);
    setDeviceStatus(isTestMode ? 'unchecked' : 'available');
    setError(null);
  };

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

          {/* Recording Controls */}
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

          {/* Recording Status */}
          {isRecording && (
            <div className="text-center text-sm text-gray-600">
              <div className="recording-indicator inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></div>
              {isTestMode ? 'Test recording in progress...' : 'Recording in progress...'}
            </div>
          )}
        </div>

        {/* Recordings List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recordings</h2>
          <div className="space-y-4">
            {recordings.map((recording) => (
              <div key={recording.id} className="border-b pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500">
                      {new Date(recording.timestamp).toLocaleString()}
                    </p>
                    <p className="text-gray-700">
                      Duration: {Math.round(recording.duration)}s
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    recording.status === 'completed' ? 'bg-green-100 text-green-800' :
                    recording.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {recording.status}
                  </span>
                </div>
                {recording.transcript && (
                  <div className="mt-2">
                    <p className="text-gray-800 whitespace-pre-wrap font-hindi">
                      {recording.transcript}
                    </p>
                  </div>
                )}
                {recording.status === 'processing' && (
                  <div className="mt-2">
                    <p className="text-yellow-600">
                      <span className="inline-block animate-spin mr-2">⚙️</span>
                      Processing transcription...
                    </p>
                  </div>
                )}
                {recording.status === 'failed' && recording.error && (
                  <div className="mt-2">
                    <p className="text-red-600">
                      Error: {recording.error}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {recordings.length === 0 && (
              <p className="text-gray-500 text-center">No recordings yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;