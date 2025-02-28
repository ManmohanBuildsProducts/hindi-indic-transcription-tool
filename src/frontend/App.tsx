import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

interface Settings {
  sarvamApiKey?: string;
  outputDirectory?: string;
}

interface Transcription {
  timestamp: string;
  text: string;
  filePath: string;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState<string | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  useEffect(() => {
    loadSettings();
    setupEventListeners();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const setupEventListeners = () => {
    window.electron.onTranscriptionReady((data) => {
      setTranscriptions(prev => [...prev, data]);
    });

    window.electron.onTranscriptionError((data) => {
      setError(`Transcription error for ${data.filePath}: ${data.error}`);
    });

    window.electron.onRecordingError((error) => {
      setError(error);
      setIsRecording(false);
      setIsProcessing(false);
    });
  };

  const loadSettings = async () => {
    const result = await window.electron.getSettings();
    if (result.success) {
      setSettings(result.settings || {});
    } else {
      setError('Failed to load settings');
    }
  };

  const handleStartRecording = async () => {
    if (!settings.sarvamApiKey) {
      setError('Please set your Sarvam AI API key first');
      return;
    }

    setError(null);
    const result = await window.electron.startRecording();
    if (result.success) {
      setIsRecording(true);
    } else {
      setError(result.error);
    }
  };

  const handleStopRecording = async () => {
    setIsProcessing(true);
    const result = await window.electron.stopRecording();
    if (result.success) {
      setIsRecording(false);
    } else {
      setError(result.error);
    }
    setIsProcessing(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await window.electron.saveSettings(settings);
    if (!result.success) {
      setError(result.error);
    }
  };

  const handleSelectOutputDirectory = async () => {
    const result = await window.electron.selectOutputDirectory();
    if (result.success && result.outputDirectory) {
      setSettings(prev => ({ ...prev, outputDirectory: result.outputDirectory }));
    } else if (result.error) {
      setError(result.error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Hindi Transcription Tool</h1>
          {isRecording && (
            <div className="text-lg font-semibold text-red-500">
              {formatDuration(recordingDuration)}
            </div>
          )}
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center justify-between">
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="text-red-700 hover:text-red-900"
            >
              ✕
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Recording Controls</h2>
          <div className="flex gap-4 items-center">
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isProcessing}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isRecording ? (
                <>
                  <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
                  Stop Recording
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Start Recording
                </>
              )}
            </button>
            {isProcessing && (
              <div className="flex items-center text-yellow-600">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Settings</h2>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Sarvam AI API Key
              </label>
              <input
                type="password"
                value={settings.sarvamApiKey || ''}
                onChange={(e) =>
                  setSettings({ ...settings, sarvamApiKey: e.target.value })
                }
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="Enter your API key"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Output Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.outputDirectory || ''}
                  readOnly
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight bg-gray-50"
                  placeholder="Select output directory"
                />
                <button
                  type="button"
                  onClick={handleSelectOutputDirectory}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg"
                >
                  Browse
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg w-full"
            >
              Save Settings
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Transcriptions</h2>
          <div className="space-y-4">
            {transcriptions.map((transcription, index) => (
              <div key={index} className="border-b pb-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm text-gray-500">
                    {new Date(transcription.timestamp).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400 truncate max-w-xs">
                    {transcription.filePath}
                  </div>
                </div>
                <div className="text-gray-700 whitespace-pre-wrap">
                  {transcription.text}
                </div>
              </div>
            ))}
            {transcriptions.length === 0 && (
              <div className="text-gray-500 text-center py-8">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p>No transcriptions yet</p>
                <p className="text-sm mt-2">Start recording to see transcriptions here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;</absolute_file_name>
</file>