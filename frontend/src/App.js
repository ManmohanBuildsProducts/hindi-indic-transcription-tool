import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unchecked');
  const [isTestMode, setIsTestMode] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const recordingTimer = useRef(null);

  // Update recording duration
  useEffect(() => {
    if (isRecording) {
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimer.current);
      setRecordingDuration(0);
    }
    return () => clearInterval(recordingTimer.current);
  }, [isRecording]);

  useEffect(() => {
    // Load existing recordings
    fetchRecordings();
    // Check device status
    checkAudioDevice();
  }, []);

  const pollRecordingStatus = async (recordingId) => {
    try {
      const response = await fetch(`http://localhost:55285/recordings/${recordingId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch recording status');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error polling status:', error);
      return null;
    }
  };

  const fetchRecordings = async () => {
    try {
      const response = await fetch('http://localhost:55285/recordings');
      if (!response.ok) {
        throw new Error('Failed to fetch recordings');
      }
      const data = await response.json();
      setRecordings(data.recordings);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setError('Failed to load recordings');
    }
  };

  const checkAudioDevice = async () => {
    try {
      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        setDeviceStatus('unavailable');
        setError('Your browser does not support audio recording. Please use a modern browser.');
        return false;
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDeviceStatus('unavailable');
        setError('Audio recording is not supported in your browser.');
        return false;
      }

      // List available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudioDevice = devices.some(device => device.kind === 'audioinput');

      if (!hasAudioDevice) {
        setDeviceStatus('unavailable');
        setError('No microphone found. Please connect a microphone and try again.');
        return false;
      }

      // Request permission and test device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Test if we can actually record
      const testRecorder = new MediaRecorder(stream);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
      
      setDeviceStatus('available');
      setError(null);
      return true;

    } catch (err) {
      console.error('Device check error:', err);
      
      // Handle specific error cases
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please check your microphone connection.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Could not access your microphone. Please check if another application is using it.');
      } else {
        setError('Could not access audio device. Please check your microphone and browser settings.');
      }
      
      setDeviceStatus('unavailable');
      return false;
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
      setIsRecording(false);
      setIsUploading(true);
      
      if (isTestMode) {
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
        
        // Wait a bit to simulate processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await fetchRecordings();
        setIsUploading(false);
        return;
      }

      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        // Stop recording
        mediaRecorder.current.stop();
        mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        
        // Wait for the last chunk
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
          const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
          throw new Error(errorData.detail || 'Failed to upload recording');
        }
        
        const result = await response.json();
        setRecordingId(result.recording_id);
        
        // Clear recording state
        audioChunks.current = [];
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout
        
        while (attempts < maxAttempts) {
          const statusResponse = await fetch(`http://localhost:55285/recordings/${result.recording_id}`);
          const statusData = await statusResponse.json();
          
          if (statusData.status === 'completed' || statusData.status === 'failed') {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
        
        // Refresh recordings list
        await fetchRecordings();
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(error.message || 'Error stopping recording');
    } finally {
      setIsUploading(false);
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
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center text-sm text-gray-600">
                <div className="recording-indicator inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                <span>
                  {isTestMode ? 'Test recording in progress...' : 'Recording in progress...'}
                </span>
              </div>
              <div className="text-sm font-mono">
                {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                {(recordingDuration % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}
          {isUploading && (
            <div className="text-center mt-4">
              <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-blue-500 transition ease-in-out duration-150 cursor-not-allowed">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing Recording...
              </div>
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
                  <div className="flex items-center">
                    {recording.status === 'processing' && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mr-2"></div>
                    )}
                    <span className={`px-2 py-1 rounded text-xs ${
                      recording.status === 'completed' ? 'bg-green-100 text-green-800' :
                      recording.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {recording.status === 'completed' ? 'Completed' :
                       recording.status === 'failed' ? 'Failed' :
                       'Processing'}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  {recording.status === 'completed' && recording.transcript && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-500 mb-2">Transcription:</h3>
                      <div className="bg-white rounded p-4 shadow-sm">
                        <p className="text-gray-800 whitespace-pre-wrap font-hindi text-lg leading-relaxed">
                          {recording.transcript}
                        </p>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button 
                          onClick={() => navigator.clipboard.writeText(recording.transcript)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Copy Text
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {recording.status === 'processing' && (
                    <div className="flex flex-col items-center justify-center py-6 bg-blue-50 rounded-lg">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <p className="text-blue-600 mt-2">Processing your recording...</p>
                      <p className="text-sm text-blue-400">This may take a few moments</p>
                    </div>
                  )}
                  
                  {recording.status === 'failed' && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">Processing Failed</h3>
                          <p className="text-sm text-red-700 mt-1">
                            {recording.error || 'An error occurred while processing the recording'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button
                          onClick={() => window.location.reload()}
                          className="text-sm text-red-700 hover:text-red-900 underline"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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