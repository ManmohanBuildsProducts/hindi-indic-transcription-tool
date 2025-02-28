import axios from 'axios';
import * as fs from 'fs';

export class SarvamAPI {
  private apiKey: string;
  private baseUrl: string = 'https://api.sarvam.ai/v1/speech';
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(apiKey: string) {
    if (!this.isValidApiKey(apiKey)) {
      throw new Error('Invalid API key format');
    }
    this.apiKey = apiKey;
  }

  private isValidApiKey(key: string): boolean {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(key);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async transcribeAudio(audioFilePath: string, retryCount = 0): Promise<string> {
    try {
      // Check if file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // Read file and prepare form data
      const audioData = fs.readFileSync(audioFilePath);
      const formData = new FormData();
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }));

      // Make API request
      try {
        const response = await axios.post(`${this.baseUrl}/transcribe`, formData, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'multipart/form-data'
          },
          timeout: 30000 // 30 seconds timeout
        });

        // Validate response format
        if (!response?.data?.text) {
          throw new Error('Invalid response format from API');
        }

        return response.data.text;
      } catch (error) {
        // Handle Axios errors
        if (axios.isAxiosError(error)) {
          // Handle specific HTTP status codes
          if (error.response?.status === 400) {
            throw new Error('Invalid audio format. Supported formats: wav, mp3, m4a, webm');
          }
          if (error.response?.status === 401) {
            throw new Error('Invalid API key or unauthorized access');
          }
          if (error.response?.status === 413) {
            throw new Error('Audio file too large. Maximum size: 25MB');
          }
          if (error.response?.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later');
          }
          if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout - try with a shorter audio clip');
          }
          if (error.response?.status === 500) {
            // Server error - can be retried
            throw error;
          }
          // Network or other errors - can be retried
          throw error;
        }
        throw error;
      }
    } catch (error) {
      console.error(`Error transcribing audio (attempt ${retryCount + 1}):`, error);

      // Handle non-retryable errors
      if (error instanceof Error) {
        // File not found error
        if (error.message.includes('Audio file not found')) {
          throw error;
        }

        // Invalid response format
        if (error.message === 'Invalid response format from API') {
          throw error;
        }

        // Specific API errors
        if (
          error.message === 'Invalid API key or unauthorized access' ||
          error.message === 'Audio file too large' ||
          error.message === 'Request timeout - try with a shorter audio clip'
        ) {
          throw error;
        }

        // Network errors
        if (error.message === 'Network error') {
          throw error;
        }
      }

      // Handle retries
      if (retryCount < this.maxRetries) {
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.transcribeAudio(audioFilePath, retryCount + 1);
      }

      // If we get here, we've exhausted our retries
      throw new Error(`Failed to transcribe audio after ${this.maxRetries} attempts`);
    }
  }

  // Method to validate connection and API key
  async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }
}

export const createSarvamAPI = (apiKey: string) => new SarvamAPI(apiKey);