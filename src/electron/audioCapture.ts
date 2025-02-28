import { desktopCapturer, systemPreferences } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

interface AudioCaptureEvents {
  on(event: 'chunk-saved', listener: (filePath: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'recording-started', listener: () => void): this;
  on(event: 'recording-stopped', listener: () => void): this;
}

class AudioCapture extends EventEmitter implements AudioCaptureEvents {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private currentChunkStartTime: number = 0;
  private readonly CHUNK_DURATION = 8 * 60 * 1000; // 8 minutes in milliseconds
  private readonly CHUNK_INTERVAL = 1000; // 1 second
  private outputDir: string;
  private isRecording: boolean = false;
  private chunkCount: number = 0;

  constructor() {
    super();
    this.outputDir = path.join(__dirname, '../../recordings');
    this.ensureOutputDirectory();
  }

  private ensureOutputDirectory(): void {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      console.error('Error creating output directory:', error);
      throw new Error('Failed to create recordings directory');
    }
  }

  private checkPermissions(): void {
    const hasPermission = systemPreferences.getMediaAccessStatus('microphone');
    if (hasPermission !== 'granted') {
      throw new Error('Microphone permission not granted');
    }
  }

  private setupMediaRecorder(stream: MediaStream): void {
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }

      // Check if we need to create a new chunk
      if (Date.now() - this.currentChunkStartTime >= this.CHUNK_DURATION) {
        this.saveCurrentChunk();
        this.currentChunkStartTime = Date.now();
        this.chunks = [];
        this.chunkCount++;
      }
    };

    this.mediaRecorder.onerror = (event) => {
      this.emit('error', new Error('MediaRecorder error: ' + event.error));
    };

    this.currentChunkStartTime = Date.now();
    this.isRecording = true;
    this.chunkCount = 0;

    this.mediaRecorder.start(this.CHUNK_INTERVAL);
    this.emit('recording-started');
  }

  private resetState(): void {
    this.chunks = [];
    this.currentChunkStartTime = 0;
    this.chunkCount = 0;
    this.isRecording = false;
    if (this.mediaRecorder) {
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    // Check microphone permissions
    this.checkPermissions();

    // Get audio sources
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      fetchWindowIcons: false
    });

    if (sources.length === 0) {
      throw new Error('No audio sources found');
    }

    // Set up audio constraints
    const audioConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000
      } as MediaTrackConstraints,
      video: false
    } as MediaStreamConstraints;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      this.setupMediaRecorder(stream);
    } catch (error) {
      this.isRecording = false;
      throw error;
    }
  }

  

  stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No recording in progress');
    }

    try {
      this.mediaRecorder.stop();
      this.saveCurrentChunk();
      this.resetState();
      this.emit('recording-stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('error', new Error(`Failed to stop recording: ${errorMessage}`));
      throw error;
    }
  }

  private saveCurrentChunk(): void {
    if (this.chunks.length === 0) return;

    const blob = new Blob(this.chunks, { type: 'audio/webm' });
    const fileName = `recording-${Date.now()}.webm`;
    const filePath = path.join(this.outputDir, fileName);

    // Convert blob to buffer and save
    const buffer = Buffer.from(this.chunks[0]);
    fs.writeFileSync(filePath, buffer);
    this.emit('chunk-saved', filePath);
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getCurrentChunkCount(): number {
    return this.chunkCount;
  }
}

export const audioCapture = new AudioCapture();