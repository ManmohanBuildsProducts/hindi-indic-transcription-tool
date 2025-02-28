import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const [error, setError] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('unchecked'); // 'unchecked' | 'available' | 'unavailable'
  const mediaRecorder = useRef(null);
  const chunkInterval = useRef(null);

  useEffect(() => {
    // Load existing transcriptions
    fetchTranscriptions();
    
    // Check for audio device availability
    checkAudioDevice();
  }, []);

  const checkAudioDevice = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudioDevice = devices.some(device => device.kind === 'audioinput');
      setDeviceStatus(hasAudioDevice ? 'available' : 'unavailable');
      setError(hasAudioDevice ? null : 'No audio input device found. Please connect a microphone.');
    } catch (err) {
      setDeviceStatus('unavailable');
      setError('Could not access audio devices. Please check permissions.');
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
      
      if (deviceStatus !== 'available') {
        await checkAudioDevice();
        if (deviceStatus !== 'available') {
          throw new Error('Audio device not available');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(chunks => [...chunks, event.data]);
        }
      };

      mediaRecorder.current.onerror = (event) => {
        setError('Recording error: ' + event.error.message);
        stopRecording();
      };

      mediaRecorder.current.start();
      setIsRecording(true);

      // Create 8-minute chunks
      chunkInterval.current = setInterval(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          mediaRecorder.current.stop();
          mediaRecorder.current.start();
        }
      }, 8 * 60 * 1000); // 8 minutes in milliseconds

    } catch (error) {
      console.error('Error accessing microphone:', error);
      setError(error.message || 'Error accessing microphone');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      clearInterval(chunkInterval.current);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  const uploadChunk = async (chunk) => {
    const formData = new FormData();
    formData.append('audio', chunk, 'audio-chunk.webm');

    try {
      const response = await fetch('http://localhost:55285/transcribe', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      setTranscriptions(prev => [result, ...prev]);
    } catch (error) {
      console.error('Error uploading chunk:', error);
    }
  };

  useEffect(() => {
    if (audioChunks.length > 0) {
      uploadChunk(audioChunks[audioChunks.length - 1]);
    }
  }, [audioChunks]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Hindi Audio Transcription Tool</h1>
          <p className="text-gray-600 mt-2">Record and transcribe Hindi audio in real-time</p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          {/* Device Status Indicator */}
          <div className="flex items-center justify-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              deviceStatus === 'available' ? 'bg-green-500' :
              deviceStatus === 'unavailable' ? 'bg-red-500' :
              'bg-yellow-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {deviceStatus === 'available' ? 'Microphone Ready' :
               deviceStatus === 'unavailable' ? 'No Microphone' :
               'Checking Device...'}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="flex justify-center mb-6">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={deviceStatus !== 'available'}
              className={`px-6 py-3 rounded-full font-semibold text-white ${
                deviceStatus !== 'available' 
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
              Recording in progress... Audio will be processed in 8-minute chunks
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