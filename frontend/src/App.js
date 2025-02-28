import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [transcriptions, setTranscriptions] = useState([]);
  const mediaRecorder = useRef(null);
  const chunkInterval = useRef(null);

  useEffect(() => {
    // Load existing transcriptions
    fetchTranscriptions();
  }, []);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(chunks => [...chunks, event.data]);
        }
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
          <div className="flex justify-center mb-6">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-6 py-3 rounded-full font-semibold text-white ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>

          {isRecording && (
            <div className="text-center text-sm text-gray-600">
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