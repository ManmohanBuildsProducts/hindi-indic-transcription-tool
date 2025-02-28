import { EventEmitter } from 'events';
import { audioCapture } from '../audioCapture';
import { systemPreferences, desktopCapturer } from 'electron';

// Mock MediaStream
class MockMediaStream implements MediaStream {
  active = true;
  id = 'mock-stream-id';
  onaddtrack = null;
  onremovetrack = null;
  onactive = null;
  oninactive = null;
  
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    this.tracks = [{
      kind: 'audio',
      id: 'mock-track-id',
      label: 'Mock Audio Track',
      enabled: true,
      muted: false,
      readyState: 'live',
      onended: null,
      onmute: null,
      onunmute: null,
      contentHint: '',
      isolated: false,
      stop: jest.fn(),
      applyConstraints: jest.fn(),
      clone: jest.fn(),
      getCapabilities: jest.fn(),
      getConstraints: jest.fn(),
      getSettings: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    } as MediaStreamTrack];
  }

  addTrack = jest.fn();
  removeTrack = jest.fn();
  getAudioTracks = jest.fn(() => this.tracks.filter(track => track.kind === 'audio'));
  getVideoTracks = jest.fn(() => this.tracks.filter(track => track.kind === 'video'));
  getTracks = jest.fn(() => this.tracks);
  getTrackById = jest.fn();
  clone = jest.fn(() => new MockMediaStream());
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent = jest.fn();
}

// Mock BlobEvent
class MockBlobEvent extends Event implements BlobEvent {
  data: Blob;
  timecode: DOMHighResTimeStamp;

  constructor(type: string, init: { data: Blob }) {
    super(type);
    this.data = init.data;
    this.timecode = performance.now();
  }
}

// Mock MediaRecorder
class MockMediaRecorder implements MediaRecorder {
  audioBitsPerSecond = 128000;
  videoBitsPerSecond = 0;
  mimeType = 'audio/webm;codecs=opus';
  state: RecordingState = 'inactive';
  stream = new MockMediaStream();
  
  // Event handlers
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onpause: ((event: Event) => void) | null = null;
  onresume: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  // Methods
  start = jest.fn(() => {
    this.state = 'recording';
  });
  stop = jest.fn(() => {
    this.state = 'inactive';
  });
  pause = jest.fn(() => {
    this.state = 'paused';
  });
  resume = jest.fn(() => {
    this.state = 'recording';
  });
  requestData = jest.fn();

  // Event handling
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent = jest.fn();

  static isTypeSupported = jest.fn().mockReturnValue(true);
}

// @ts-ignore
global.MediaRecorder = MockMediaRecorder;
// @ts-ignore
global.BlobEvent = MockBlobEvent;

// Store the mock instance for later access
let currentMediaRecorder: MockMediaRecorder;

jest.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: jest.fn(),
  },
  desktopCapturer: {
    getSources: jest.fn().mockResolvedValue([{ id: 'test-source' }]),
  },
}));

// Mock navigator
global.navigator = {
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{
        stop: jest.fn()
      }]
    })
  }
} as any;

describe('AudioCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (systemPreferences.getMediaAccessStatus as jest.Mock).mockReturnValue('granted');
    // Reset recording state
    audioCapture['isRecording'] = false;
    audioCapture['mediaRecorder'] = null;
    audioCapture['chunks'] = [];
    audioCapture['currentChunkStartTime'] = 0;
    audioCapture['chunkCount'] = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startRecording', () => {
    beforeEach(() => {
      // Mock MediaRecorder
      currentMediaRecorder = new MockMediaRecorder();
      // @ts-ignore
      global.MediaRecorder = jest.fn(() => currentMediaRecorder);
      // Mock desktop capturer
      (desktopCapturer.getSources as jest.Mock).mockResolvedValue([{ id: 'test-source' }]);
    });

    it('should check permissions before starting', async () => {
      // Mock system preferences
      (systemPreferences.getMediaAccessStatus as jest.Mock).mockReturnValue('granted');

      await audioCapture.startRecording();
      expect(systemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('microphone');
      expect(desktopCapturer.getSources).toHaveBeenCalled();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should throw error if permissions not granted', async () => {
      (systemPreferences.getMediaAccessStatus as jest.Mock).mockReturnValue('denied');
      await expect(audioCapture.startRecording()).rejects.toThrow('Microphone permission not granted');
    });

    it('should throw error if no sources found', async () => {
      (desktopCapturer.getSources as jest.Mock).mockResolvedValue([]);
      await expect(audioCapture.startRecording()).rejects.toThrow('No audio sources found');
    });

    it('should throw error if already recording', async () => {
      // Start first recording
      await audioCapture.startRecording();
      audioCapture['isRecording'] = true;
      
      // Try to start another recording
      await expect(audioCapture.startRecording()).rejects.toThrow('Recording is already in progress');
    });

    it('should set up MediaRecorder correctly', async () => {
      await audioCapture.startRecording();
      
      expect(currentMediaRecorder.start).toHaveBeenCalled();
      expect(currentMediaRecorder.state).toBe('recording');
      expect(audioCapture.isCurrentlyRecording()).toBe(true);
    });
  });

  describe('stopRecording', () => {
    it('should throw error if no recording in progress', () => {
      audioCapture['isRecording'] = false;
      expect(() => audioCapture.stopRecording()).toThrow('No recording in progress');
    });

    it('should stop recording if in progress', async () => {
      // Start recording
      await audioCapture.startRecording();
      audioCapture['isRecording'] = true;
      audioCapture['mediaRecorder'] = currentMediaRecorder;

      // Stop recording
      audioCapture.stopRecording();
      
      expect(audioCapture.isCurrentlyRecording()).toBe(false);
      expect(currentMediaRecorder.stop).toHaveBeenCalled();
      expect(currentMediaRecorder.state).toBe('inactive');
    });

    it('should clean up resources when stopping', async () => {
      // Mock current time
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      // Start recording
      await audioCapture.startRecording();
      audioCapture['isRecording'] = true;
      audioCapture['mediaRecorder'] = currentMediaRecorder;

      // Stop recording
      audioCapture.stopRecording();
      
      expect(audioCapture['chunks']).toEqual([]);
      expect(audioCapture['currentChunkStartTime']).toBe(0);
      expect(audioCapture['chunkCount']).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should emit error events correctly', () => {
      const mockCallback = jest.fn();
      audioCapture.on('error', mockCallback);
      audioCapture.emit('error', new Error('Test error'));
      expect(mockCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit recording-started event', async () => {
      const mockCallback = jest.fn();
      audioCapture.on('recording-started', mockCallback);
      
      await audioCapture.startRecording();
      
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should emit chunk-saved event', async () => {
      // Mock current time
      jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

      const mockCallback = jest.fn();
      audioCapture.on('chunk-saved', mockCallback);
      
      // Mock successful recording start
      (desktopCapturer.getSources as jest.Mock).mockResolvedValue([{ id: 'test-source' }]);
      
      // Start recording
      await audioCapture.startRecording();
      
      // Set up the current chunk start time
      audioCapture['currentChunkStartTime'] = Date.now() - (8 * 60 * 1000 + 1); // Just over 8 minutes ago
      
      // Create a mock blob event
      const mockBlob = new Blob(['test audio data'], { type: 'audio/webm' });
      const mockEvent = new MockBlobEvent('dataavailable', { data: mockBlob });
      
      // Get the current MediaRecorder instance
      const mediaRecorder = audioCapture['mediaRecorder'];
      
      // Simulate data available
      if (mediaRecorder?.ondataavailable) {
        mediaRecorder.ondataavailable(mockEvent);
      }
      
      // Advance timers
      jest.advanceTimersByTime(100);
      
      // Wait for promises to resolve
      await Promise.resolve();
      
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle MediaRecorder errors', async () => {
      const mockCallback = jest.fn();
      audioCapture.on('error', mockCallback);
      
      // Start recording
      await audioCapture.startRecording();
      
      // Simulate error
      const errorEvent = new Event('error');
      Object.defineProperty(errorEvent, 'error', { value: new Error('MediaRecorder error') });
      currentMediaRecorder.onerror?.(errorEvent);
      
      expect(mockCallback).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});