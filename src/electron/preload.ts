import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
interface ElectronAPI {
  startRecording: () => Promise<{ success: boolean; error?: string }>;
  stopRecording: () => Promise<{ success: boolean; error?: string }>;
  saveSettings: (settings: { sarvamApiKey: string; outputDirectory?: string }) => Promise<{ success: boolean; error?: string }>;
  getSettings: () => Promise<{ success: boolean; settings?: { sarvamApiKey: string; outputDirectory?: string }; error?: string }>;
  selectOutputDirectory: () => Promise<{ success: boolean; outputDirectory?: string; error?: string }>;
  onTranscriptionReady: (callback: (data: { timestamp: string; text: string; filePath: string }) => void) => void;
  onTranscriptionError: (callback: (data: { error: string; filePath: string }) => void) => void;
  onRecordingError: (callback: (error: string) => void) => void;
}

// Expose the typed API to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // IPC invoke methods
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  saveSettings: (settings: { sarvamApiKey: string; outputDirectory?: string }) => 
    ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),

  // Event listeners
  onTranscriptionReady: (callback: (data: { timestamp: string; text: string; filePath: string }) => void) => {
    ipcRenderer.on('transcription-ready', (_event, data) => callback(data));
  },
  onTranscriptionError: (callback: (data: { error: string; filePath: string }) => void) => {
    ipcRenderer.on('transcription-error', (_event, data) => callback(data));
  },
  onRecordingError: (callback: (error: string) => void) => {
    ipcRenderer.on('recording-error', (_event, error) => callback(error));
  }
} as ElectronAPI);</absolute_file_name>
</file>