const { BrowserWindow, net } = require('electron');
const dotenv = require('dotenv');
const authManager = require('./auth');

// Load environment variables
dotenv.config();

// API configuration
const API_CONFIG = {
  API_URL: process.env.AI_API_URL || 'https://api.perplexity.ai/chat/completions',
  API_KEY: process.env.AI_API_KEY || '',
  MODEL: process.env.AI_MODEL || 'sonar',
  UI_URL: process.env.UI_URL || 'http://localhost:3000'
};

class ApiService {
  constructor() {
    this.authManager = authManager;
    this.isAuthenticating = false;
    this.mainWindow = null;
  }

  // Initialize the API service
  async init() {
    await this.authManager.init();
  }

  // Set reference to the main window
  setMainWindow(window) {
    this.mainWindow = window;
  }

  // Get authentication headers
  getAuthHeaders() {
    const token = this.authManager.getBearerToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  // Ensure we have a valid authentication token
  async ensureAuthenticated() {
    if (this.isAuthenticating) {
      throw new Error('Authentication already in progress');
    }
    
    // If we already have a valid token, return immediately
    if (this.authManager.isTokenValid()) {
      return true;
    }
    
    this.isAuthenticating = true;
    
    try {
      // If we have a main window, try to capture token from it
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        // Navigate to the UI URL if not already there
        const currentUrl = this.mainWindow.webContents.getURL();
        if (!currentUrl.startsWith(API_CONFIG.UI_URL)) {
          await this.mainWindow.loadURL(API_CONFIG.UI_URL);
        }
        
        // First try to capture token if already logged in
        let hasToken = await this.authManager.captureTokenFromWindow(this.mainWindow);
        if (hasToken) {
          this.isAuthenticating = false;
          return true;
        }
        
        // Wait for page navigation (user manually logs in)
        await new Promise((resolve) => {
          const navHandler = async (event, url) => {
            // When navigation happens, try to capture token
            const tokenCaptured = await this.authManager.captureTokenFromWindow(this.mainWindow);
            if (tokenCaptured) {
              this.mainWindow.webContents.removeListener('did-navigate', navHandler);
              resolve(true);
            }
          };
          
          this.mainWindow.webContents.on('did-navigate', navHandler);
          
          // Also set a timeout in case user doesn't login
          setTimeout(() => {
            this.mainWindow.webContents.removeListener('did-navigate', navHandler);
            resolve(false);
          }, 60000); // 1 minute timeout
        });
        
        // Final check for token
        hasToken = await this.authManager.captureTokenFromWindow(this.mainWindow);
        return hasToken;
      }
      
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    } finally {
      this.isAuthenticating = false;
    }
  }

  // Make a fetch request using Electron's net module
  async fetchWithElectron(url, options) {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: options.method || 'GET',
        url: url,
        redirect: 'follow'
      });
      
      // Add headers
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          request.setHeader(key, value);
        });
      }
      
      // Handle response
      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk.toString();
        });
        
        response.on('end', () => {
          // Parse JSON if possible
          let parsedData;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            parsedData = data;
          }
          
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: response.headers,
            json: () => Promise.resolve(parsedData),
            text: () => Promise.resolve(data)
          });
        });
      });
      
      // Handle errors
      request.on('error', (error) => {
        reject(error);
      });
      
      // Write body if provided
      if (options.body) {
        request.write(options.body);
      }
      
      // End the request
      request.end();
    });
  }

  // Send query to AI API
  async sendAiQuery(query, webSearch = false) {
    try {
      // Check if we need to authenticate
      const token = this.authManager.getBearerToken();
      
      if (!token) {
        // Need to authenticate
        const authenticated = await this.ensureAuthenticated();
        if (!authenticated) {
          throw new Error('Authentication failed');
        }
      }
      
      // Prepare request data
      const requestData = {
        model: API_CONFIG.MODEL,
        messages: [{ role: 'user', content: query }],
        max_tokens: 1000
      };

      // Add web search parameter if enabled
      if (webSearch) {
        requestData.web_search = true;
      }
      
      // Send request to AI API using our fetch wrapper
      const response = await this.fetchWithElectron(API_CONFIG.API_URL, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Parse JSON response
      const data = await response.json();
      console.log('AI API response received');
      
      // Extract conversation ID from response
      const conversationId = data.conversation_id;
      
      return {
        conversationId,
        initialResponse: data
      };
    } catch (error) {
      console.error('AI API error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

module.exports = apiService; 