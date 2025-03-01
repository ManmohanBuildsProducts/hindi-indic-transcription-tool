import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unchecked');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioSource, setAudioSource] = useState('microphone'); // 'microphone' or 'system'
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const durationTimer = useRef(null);

  useEffect(() => {
    fetchRecordings();
    checkAudioDevice();
  }, []);

  useEffect(() => {
    if (isRecording) {
      durationTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(durationTimer.current);
      setRecordingDuration(0);
    }
    return () => clearInterval(durationTimer.current);
  }, [isRecording]);

  const fetchRecordings = async () => {
    try {
      const response = await fetch('http://localhost:55285/recordings');
      if (!response.ok) throw new Error('Failed to fetch recordings');
      const data = await response.json();
      setRecordings(data.recordings);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setError('Failed to load recordings');
    }
  };

  const checkAudioDevice = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDeviceStatus('unavailable');
        setError('Audio recording is not supported in your browser');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setDeviceStatus('available');
      setError(null);
      return true;
    } catch (err) {
      console.error('Device check error:', err);
      setDeviceStatus('unavailable');
      setError('Could not access microphone. Please check permissions.');
      return false;
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      audioChunks.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };

      mediaRecorder.current = new MediaRecorder(stream, options);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.start(8 * 60 * 1000); // 8 minutes chunks
      setIsRecording(true);

    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message || 'Error starting recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (!mediaRecorder.current) return;

      setIsRecording(false);
      setIsProcessing(true);

      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());

      // Create a single blob from all chunks
      const audioBlob = new Blob(audioChunks.current, { 
        type: mediaRecorder.current.mimeType 
      });

      // Upload recording
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('source', audioSource);

      const response = await fetch('http://localhost:55285/recordings', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload recording');
      }

      const result = await response.json();
      setRecordingId(result.recording_id);

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const statusResponse = await fetch(`http://localhost:55285/recordings/${result.recording_id}`);
        const statusData = await statusResponse.json();

        if (statusData.status === 'completed' || statusData.status === 'failed') {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      await fetchRecordings();
      audioChunks.current = [];

    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(error.message || 'Error processing recording');
    } finally {
      setIsProcessing(false);
      mediaRecorder.current = null;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Hindi Audio Transcription</h1>
          <p className="text-gray-600 mt-2">Record and transcribe Hindi audio in real-time</p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          {/* Device Status */}
          <div className="flex items-center justify-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              deviceStatus === 'available' ? 'bg-green-500' :
              deviceStatus === 'unavailable' ? 'bg-red-500' :
              'bg-yellow-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {deviceStatus === 'available' ? 'Ready to Record' :
               deviceStatus === 'unavailable' ? 'Microphone Not Available' :
               'Checking Device...'}
            </span>
          </div>

          {/* Audio Source Selection */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => setAudioSource('microphone')}
                className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                  audioSource === 'microphone'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } border border-gray-200`}
              >
                Microphone
              </button>
              <button
                type="button"
                onClick={() => setAudioSource('system')}
                className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                  audioSource === 'system'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } border border-l-0 border-gray-200`}
              >
                System Audio
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Recording Controls */}
          <div className="flex flex-col items-center">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={deviceStatus !== 'available' || isProcessing}
              className={`relative inline-flex items-center px-6 py-3 rounded-full text-white font-medium transition-all ${
                isProcessing 
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isRecording
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : isRecording ? (
                <>
                  <span className="animate-pulse mr-2">●</span>
                  Stop Recording
                </>
              ) : (
                'Start Recording'
              )}
            </button>

            {isRecording && (
              <div className="mt-4 text-sm text-gray-600">
                Recording Duration: {formatTime(recordingDuration)}
              </div>
            )}
          </div>
        </div>

        {/* Transcriptions List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Transcriptions</h2>
          <div className="space-y-4">
            {recordings.map((recording) => (
              <div key={recording.id} className="border-b pb-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm text-gray-500">
                      {new Date(recording.timestamp).toLocaleString()}
                    </p>
                    <p className="text-gray-700">
                      Duration: {Math.round(recording.duration)}s
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    recording.status === 'completed' ? 'bg-green-100 text-green-800' :
                    recording.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {recording.status}
                  </span>
                </div>

                {recording.status === 'completed' && recording.transcript && (
                  <div className="bg-gray-50 rounded p-4 font-hindi">
                    <p className="text-gray-800 whitespace-pre-wrap">
                      {recording.transcript}
                    </p>
                    <button 
                      onClick={() => navigator.clipboard.writeText(recording.transcript)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Copy Text
                    </button>
                  </div>
                )}

                {recording.status === 'processing' && (
                  <div className="flex items-center justify-center py-4 text-gray-600">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing transcription...
                  </div>
                )}

                {recording.status === 'failed' && (
                  <div className="bg-red-50 p-4 rounded">
                    <p className="text-red-700">
                      {recording.error || 'Failed to process recording'}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {recordings.length === 0 && (
              <p className="text-center text-gray-500">No recordings yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;