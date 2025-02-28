import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { audioCapture } from './audioCapture';
import { createSarvamAPI, SarvamAPI } from './sarvamAPI';

interface AppSettings {
  sarvamApiKey: string;
  outputDirectory?: string;
}

const store = new Store<AppSettings>();
let mainWindow: BrowserWindow | null = null;
let sarvamAPI: SarvamAPI | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));

  // Handle window close
  mainWindow.on('close', (e) => {
    if (audioCapture.isCurrentlyRecording()) {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'Recording is in progress. Are you sure you want to quit?'
      });
      
      if (choice === 1) {
        e.preventDefault();
      } else {
        audioCapture.stopRecording();
      }
    }
  });
};

const initializeApp = async () => {
  try {
    const apiKey = store.get('sarvamApiKey');
    if (apiKey) {
      sarvamAPI = createSarvamAPI(apiKey);
      const isConnected = await sarvamAPI.testConnection();
      if (!isConnected && mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'API Connection Failed',
          message: 'Could not connect to Sarvam AI API. Please check your API key and internet connection.'
        });
      }
    }
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
};

app.whenReady().then(() => {
  createWindow();
  initializeApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Set up audio capture event handlers
audioCapture.on('chunk-saved', async (filePath: string) => {
  if (!sarvamAPI) {
    console.error('Sarvam API not initialized');
    return;
  }

  try {
    const transcription = await sarvamAPI.transcribeAudio(filePath);
    mainWindow?.webContents.send('transcription-ready', {
      timestamp: new Date().toISOString(),
      text: transcription,
      filePath
    });
  } catch (error) {
    console.error('Transcription error:', error);
    mainWindow?.webContents.send('transcription-error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath
    });
  }
});

audioCapture.on('error', (error: Error) => {
  console.error('Audio capture error:', error);
  mainWindow?.webContents.send('recording-error', error.message);
});

// IPC Handlers
ipcMain.handle('start-recording', async () => {
  try {
    if (!sarvamAPI) {
      throw new Error('Please set up your Sarvam AI API key first');
    }

    const isConnected = await sarvamAPI.testConnection();
    if (!isConnected) {
      throw new Error('Cannot connect to Sarvam AI API. Please check your internet connection.');
    }

    await audioCapture.startRecording();
    return { success: true };
  } catch (error) {
    console.error('Failed to start recording:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('stop-recording', async () => {
  try {
    audioCapture.stopRecording();
    return { success: true };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('save-settings', async (event, settings: AppSettings) => {
  try {
    // Validate API key format
    sarvamAPI = createSarvamAPI(settings.sarvamApiKey);
    
    // Test API connection
    const isConnected = await sarvamAPI.testConnection();
    if (!isConnected) {
      throw new Error('Could not connect to Sarvam AI API with the provided key');
    }

    // Save settings only if validation passes
    store.set('sarvamApiKey', settings.sarvamApiKey);
    if (settings.outputDirectory) {
      store.set('outputDirectory', settings.outputDirectory);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to save settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('get-settings', () => {
  try {
    return {
      success: true,
      settings: {
        sarvamApiKey: store.get('sarvamApiKey'),
        outputDirectory: store.get('outputDirectory')
      }
    };
  } catch (error) {
    console.error('Failed to get settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('select-output-directory', async () => {
  try {
    if (!mainWindow) {
      throw new Error('Application window not initialized');
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Output Directory'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const outputDirectory = result.filePaths[0];
      store.set('outputDirectory', outputDirectory);
      return { success: true, outputDirectory };
    }

    return { success: false, error: 'No directory selected' };
  } catch (error) {
    console.error('Failed to select output directory:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});