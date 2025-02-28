import { SarvamAPI } from '../sarvamAPI';
import axios from 'axios';
import * as fs from 'fs';

jest.mock('axios');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('SarvamAPI', () => {
  const validApiKey = 'ec7650e8-3560-48c7-8c69-649f1c659680';
  const invalidApiKey = 'invalid-key';
  const audioFilePath = '/path/to/audio.webm';
  const mockAudioData = Buffer.from('test audio data');
  const mockTranscription = { text: 'Test transcription' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(mockAudioData);
    // Reset the delay function to make tests run faster
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });
  });

  describe('constructor', () => {
    it('should create instance with valid API key', () => {
      expect(() => new SarvamAPI(validApiKey)).not.toThrow();
    });

    it('should throw error with invalid API key', () => {
      expect(() => new SarvamAPI(invalidApiKey)).toThrow('Invalid API key format');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockedAxios.get.mockResolvedValueOnce({ status: 200 });
      const api = new SarvamAPI(validApiKey);
      const result = await api.testConnection();
      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection failed'));
      const api = new SarvamAPI(validApiKey);
      const result = await api.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('transcribeAudio', () => {
    it('should successfully transcribe audio', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: mockTranscription });
      const api = new SarvamAPI(validApiKey);
      const result = await api.transcribeAudio(audioFilePath);
      expect(result).toBe(mockTranscription.text);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(audioFilePath);
    });

    it('should handle missing audio file', async () => {
      mockedFs.existsSync.mockReturnValueOnce(false);
      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow(`Audio file not found: ${audioFilePath}`);
    });

    it('should handle API errors with retry', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValueOnce({ data: mockTranscription });

      const api = new SarvamAPI(validApiKey);
      const result = await api.transcribeAudio(audioFilePath);
      expect(result).toBe(mockTranscription.text);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid audio format', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API error
      const error = new Error('Bad Request') as any;
      error.response = { status: 400 };
      error.isAxiosError = true;
      mockedAxios.post.mockRejectedValueOnce(error);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Invalid audio format. Supported formats: wav, mp3, m4a, webm');
    });

    it('should handle unauthorized access', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API error
      const error = new Error('Unauthorized') as any;
      error.response = { status: 401 };
      error.isAxiosError = true;
      mockedAxios.post.mockRejectedValueOnce(error);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Invalid API key or unauthorized access');
    });

    it('should handle file size limit', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API error
      const error = new Error('Payload Too Large') as any;
      error.response = { status: 413 };
      error.isAxiosError = true;
      mockedAxios.post.mockRejectedValueOnce(error);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Audio file too large. Maximum size: 25MB');
    });

    it('should handle rate limit', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API error
      const error = new Error('Too Many Requests') as any;
      error.response = { status: 429 };
      error.isAxiosError = true;
      mockedAxios.post.mockRejectedValueOnce(error);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Rate limit exceeded. Please try again later');
    });

    it('should handle timeout errors', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API error
      const error = new Error('timeout of 30000ms exceeded') as any;
      error.code = 'ECONNABORTED';
      error.isAxiosError = true;
      mockedAxios.post.mockRejectedValueOnce(error);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Request timeout - try with a shorter audio clip');
    });

    it('should handle max retries exceeded', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API errors
      mockedAxios.post
        .mockRejectedValueOnce({
          response: { status: 500 },
          isAxiosError: true,
          message: 'Request failed with status code 500'
        } as any)
        .mockRejectedValueOnce({
          response: { status: 500 },
          isAxiosError: true,
          message: 'Request failed with status code 500'
        } as any)
        .mockRejectedValueOnce({
          response: { status: 500 },
          isAxiosError: true,
          message: 'Request failed with status code 500'
        } as any)
        .mockRejectedValueOnce({
          response: { status: 500 },
          isAxiosError: true,
          message: 'Request failed with status code 500'
        } as any);

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Failed to transcribe audio after 3 attempts');
      expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    });

    it('should handle invalid response format', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock API response
      mockedAxios.post.mockResolvedValueOnce({ data: {} }); // Missing text field

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Invalid response format from API');
    });

    it('should handle network errors', async () => {
      // Mock file system
      mockedFs.existsSync.mockReturnValueOnce(true);
      mockedFs.readFileSync.mockReturnValueOnce(mockAudioData);

      // Mock network error
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      const api = new SarvamAPI(validApiKey);
      await expect(api.transcribeAudio(audioFilePath))
        .rejects
        .toThrow('Network error');
    });
  });
});