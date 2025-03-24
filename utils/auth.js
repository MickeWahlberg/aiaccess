const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Token storage file path
const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'auth-token.json');

class AuthManager {
  constructor() {
    this.tokenData = null;
    this.initialized = false;
  }

  // Initialize the token manager
  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadTokenFromStorage();
    } catch (error) {
      console.log('No existing token found, will need to authenticate');
    }
    
    this.initialized = true;
  }

  // Load token from file storage
  async loadTokenFromStorage() {
    return new Promise((resolve, reject) => {
      fs.readFile(TOKEN_FILE_PATH, 'utf8', (err, data) => {
        if (err) {
          console.error('Error reading token file:', err);
          return reject(err);
        }
        
        try {
          this.tokenData = JSON.parse(data);
          console.log('Token loaded from storage');
          resolve(this.tokenData);
        } catch (error) {
          console.error('Error parsing token data:', error);
          reject(error);
        }
      });
    });
  }

  // Save token to file storage
  async saveTokenToStorage() {
    return new Promise((resolve, reject) => {
      if (!this.tokenData) {
        return reject(new Error('No token data to save'));
      }
      
      fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(this.tokenData), 'utf8', (err) => {
        if (err) {
          console.error('Error writing token file:', err);
          return reject(err);
        }
        
        console.log('Token saved to storage');
        resolve();
      });
    });
  }

  // Check if we have a valid token
  isTokenValid() {
    if (!this.tokenData || !this.tokenData.accessToken) {
      return false;
    }
    
    // Check expiration (with 5-minute buffer)
    const expiresAt = this.tokenData.expiresAt;
    const nowWithBuffer = Date.now() + (5 * 60 * 1000); // Current time + 5 minutes
    
    return expiresAt > nowWithBuffer;
  }

  // Get current bearer token, or null if not available
  getBearerToken() {
    return this.isTokenValid() ? this.tokenData.accessToken : null;
  }

  // Update token from browser window
  async captureTokenFromWindow(window) {
    if (!window || window.isDestroyed()) {
      return false;
    }

    try {
      // Attempt to extract token from the web page
      const tokenData = await window.webContents.executeJavaScript(`
        (function() {
          // Try to get from localStorage
          const token = localStorage.getItem('accessToken') || 
                       localStorage.getItem('token') || 
                       localStorage.getItem('oktaToken');
          
          // Try to get expiration
          const expiresAt = localStorage.getItem('tokenExpiresAt') || 
                           (Date.now() + (3600 * 1000)); // Default to 1 hour
          
          return token ? { 
            accessToken: token,
            expiresAt: Number(expiresAt)
          } : null;
        })();
      `);

      if (tokenData && tokenData.accessToken) {
        this.tokenData = tokenData;
        await this.saveTokenToStorage();
        console.log('Token captured from window');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error capturing token from window:', error);
      return false;
    }
  }

  // Update token data manually
  async updateTokenData(tokenData) {
    this.tokenData = tokenData;
    await this.saveTokenToStorage();
  }

  // Clear token data (for logout)
  async clearTokenData() {
    this.tokenData = null;
    
    return new Promise((resolve, reject) => {
      fs.unlink(TOKEN_FILE_PATH, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error('Error removing token file:', err);
          return reject(err);
        }
        
        console.log('Token data cleared');
        resolve();
      });
    });
  }
}

// Singleton instance
const authManager = new AuthManager();

module.exports = authManager; 