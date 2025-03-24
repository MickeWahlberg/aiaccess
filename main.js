const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const apiService = require('./utils/api');

// Load environment variables
dotenv.config();

// Environment variables with fallbacks
const config = {
  UI_URL: process.env.UI_URL || 'http://localhost:3000',
  KEYBIND_SEARCH: process.env.KEYBIND_SEARCH || 'CommandOrControl+K',
  KEYBIND_CHAT: process.env.KEYBIND_CHAT || 'CommandOrControl+Shift+K',
  KEYBIND_CLOSE: process.env.KEYBIND_CLOSE || 'Escape'
};

console.log('Application configuration:', config);

let mainWindow = null;
let searchWindow = null;

// Set window to show on current desktop space (macOS only)
function setWindowToCurrentSpace(window) {
  if (!window || window.isDestroyed()) return;

  // Only apply special handling on macOS
  if (process.platform === 'darwin') {
    try {
      // Make sure the window is not minimized
      if (window.isMinimized()) {
        window.restore();
      }
      
      // Set to appear on all workspaces temporarily
      window.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
      
      // Show window without activating application first
      window.showInactive();
      
      // For search window only, ensure it stays on top
      if (window === searchWindow) {
        window.setAlwaysOnTop(true);
      }
      
      // Focus the window and app to ensure proper keyboard input
      window.focus();
      app.focus({steal: true});
      
      // Return to current space only after very short delay
      setTimeout(() => {
        if (window && !window.isDestroyed()) {
          window.setVisibleOnAllWorkspaces(false);
        }
      }, 50);
    } catch (error) {
      console.error('Error setting window space behavior:', error);
    }
  } else {
    // For non-macOS platforms, simpler behavior
    window.show();
    window.focus();
  }
}

// Create the main window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false // Don't show until we're ready
  });

  // Set to show on current desktop space
  mainWindow.once('ready-to-show', () => {
    setWindowToCurrentSpace(mainWindow);
  });

  mainWindow.loadURL(config.UI_URL).catch(error => {
    console.error('Failed to load UI URL:', error);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Pass the window reference to the API service
  apiService.setMainWindow(mainWindow);
  
  return mainWindow;
}

// Create the search window
function createSearchWindow() {
  // If window exists, just show it and return
  if (searchWindow !== null && !searchWindow.isDestroyed()) {
    // Mark as just shown to prevent immediate hiding
    searchWindow.justShown = true;
    
    // Reset search before showing
    searchWindow.webContents.send('reset-search');
    
    // Use our current space function to show window
    setWindowToCurrentSpace(searchWindow);
    
    // After a delay, allow blur to hide the window
    clearTimeout(searchWindow.justShownTimeout);
    searchWindow.justShownTimeout = setTimeout(() => {
      if (searchWindow && !searchWindow.isDestroyed()) {
        searchWindow.justShown = false;
      }
    }, 300);
    
    return;
  }

  searchWindow = new BrowserWindow({
    width: 600,
    height: 120,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    skipTaskbar: true,
    hasShadow: true,
    show: false
  });

  // Add tracking properties
  searchWindow.justShown = false;
  searchWindow.blurTimeout = null;
  searchWindow.justShownTimeout = null;

  searchWindow.loadFile('search.html');
  searchWindow.center();
  
  // Show window when ready
  searchWindow.once('ready-to-show', () => {
    searchWindow.justShown = true;
    setWindowToCurrentSpace(searchWindow);
    
    // After a delay, allow blur to hide the window
    searchWindow.justShownTimeout = setTimeout(() => {
      if (searchWindow && !searchWindow.isDestroyed()) {
        searchWindow.justShown = false;
      }
    }, 300);
  });

  // Handle blur event to hide window
  searchWindow.on('blur', () => {
    // Don't hide if window was just shown
    if (searchWindow.justShown) return;

    // Clear any existing timeout
    clearTimeout(searchWindow.blurTimeout);
    
    // Set a new timeout to hide
    searchWindow.blurTimeout = setTimeout(() => {
      if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
        hideWindow(searchWindow);
      }
    }, 100);
  });

  // Clear hide timeout on focus
  searchWindow.on('focus', () => {
    clearTimeout(searchWindow.blurTimeout);
  });

  // Prevent actual window closure
  searchWindow.on('close', (event) => {
    event.preventDefault();
    hideWindow(searchWindow);
  });
}

// Consistent window hiding function
function hideWindow(window) {
  if (!window || window.isDestroyed()) return;
  
  // Hide the window
  window.hide();
  
  // On macOS, hide the app to return focus to previous window
  if (process.platform === 'darwin') {
    app.hide();
  }
}

// Navigate to conversation with ID
function navigateToConversation(conversationId) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }

  const conversationUrl = `${config.UI_URL}/conversation?id=${conversationId}`;
  console.log('Navigating to conversation:', conversationUrl);
  
  mainWindow.loadURL(conversationUrl).catch(error => {
    console.error('Failed to load conversation URL:', error);
  });

  setWindowToCurrentSpace(mainWindow);
}

// Show initial loader before API call
function showLoadingState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }
  
  // Inject loading indicator
  mainWindow.webContents.executeJavaScript(`
    (function() {
      // Create loading overlay if not exists
      if (!document.getElementById('loading-overlay')) {
        const loader = document.createElement('div');
        loader.id = 'loading-overlay';
        loader.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center;';
        
        const spinner = document.createElement('div');
        spinner.style.cssText = 'width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;';
        
        const style = document.createElement('style');
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        
        document.head.appendChild(style);
        loader.appendChild(spinner);
        document.body.appendChild(loader);
      } else {
        document.getElementById('loading-overlay').style.display = 'flex';
      }
    })();
  `).catch(err => console.error('Error showing loading state:', err));
  
  setWindowToCurrentSpace(mainWindow);
}

// Remove loading indicator
function hideLoadingState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  mainWindow.webContents.executeJavaScript(`
    (function() {
      const loader = document.getElementById('loading-overlay');
      if (loader) {
        loader.style.display = 'none';
      }
    })();
  `).catch(err => console.error('Error hiding loading state:', err));
}

// Handle search query
ipcMain.on('search-query', async (event, query) => {
  try {
    console.log('Processing search query:', query);
    
    // Create main window if it doesn't exist
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.log('Creating main window for query');
      mainWindow = createMainWindow();
    }
    
    // Show loading state
    showLoadingState();
    
    // Hide the search window
    if (searchWindow && !searchWindow.isDestroyed()) {
      hideWindow(searchWindow);
    }
    
    // Send query to AI API
    console.log('Sending query to API');
    const response = await apiService.sendAiQuery(query);
    
    // Hide loading state
    hideLoadingState();
    
    // Navigate to conversation ID when available
    if (response && response.conversationId) {
      navigateToConversation(response.conversationId);
    } else {
      console.warn('No conversation ID in response');
      // Fall back to showing main window
      setWindowToCurrentSpace(mainWindow);
    }
  } catch (error) {
    console.error('Search error:', error);
    
    // Hide loading state
    hideLoadingState();
    
    // Show main window with error state
    if (mainWindow && !mainWindow.isDestroyed()) {
      setWindowToCurrentSpace(mainWindow);
      mainWindow.webContents.executeJavaScript(`
        alert('Error: ${error.message.replace(/'/g, "\\'")}');
      `).catch(err => console.error('Error showing error message:', err));
    }
  }
});

// Register global shortcuts
function registerShortcuts() {
  // Unregister all shortcuts first
  globalShortcut.unregisterAll();
  console.log('All previous shortcuts unregistered');

  console.log('Attempting to register shortcuts:');
  console.log('- Search:', config.KEYBIND_SEARCH);
  console.log('- Chat:', config.KEYBIND_CHAT);
  console.log('- Close:', config.KEYBIND_CLOSE);
  
  // Register search shortcut
  const searchRegistered = globalShortcut.register(config.KEYBIND_SEARCH, () => {
    console.log('Search shortcut triggered (CMD+K)');
    if (searchWindow && !searchWindow.isDestroyed()) {
      if (searchWindow.isVisible()) {
        hideWindow(searchWindow);
        console.log('Search window hidden');
      } else {
        // Make sure the app is activated on macOS
        if (process.platform === 'darwin') {
          app.show();
        }
        
        // Mark the window as just shown
        searchWindow.justShown = true;
        
        // Reset search input
        searchWindow.webContents.send('reset-search');
        
        // Show on current space
        setWindowToCurrentSpace(searchWindow);
        console.log('Search window shown');
        
        // After delay, allow blur to hide window
        clearTimeout(searchWindow.justShownTimeout);
        searchWindow.justShownTimeout = setTimeout(() => {
          if (searchWindow && !searchWindow.isDestroyed()) {
            searchWindow.justShown = false;
          }
        }, 300);
      }
    } else {
      createSearchWindow();
      console.log('Search window created');
    }
  });

  // Register chat shortcut
  const chatRegistered = globalShortcut.register(config.KEYBIND_CHAT, () => {
    // Make sure the app is activated on macOS
    if (process.platform === 'darwin') {
      app.show();
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      // If window exists, make sure it's visible and focused
      setWindowToCurrentSpace(mainWindow);
      
      // Reload the URL
      mainWindow.loadURL(config.UI_URL);
      console.log('Main window shown and focused with CMD+Shift+K');
    } else {
      // If window doesn't exist, create it
      createMainWindow();
      console.log('Main window created with CMD+Shift+K');
    }
  });

  // Register close shortcut
  const closeRegistered = globalShortcut.register(config.KEYBIND_CLOSE, () => {
    // If search window is visible, hide it
    if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
      hideWindow(searchWindow);
    } else if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      // If main window is visible, hide it
      hideWindow(mainWindow);
    }
  });

  console.log('Shortcuts registered:', {
    search: searchRegistered,
    chat: chatRegistered,
    close: closeRegistered
  });

  // Verify shortcut registration
  console.log('Verifying shortcuts are registered:');
  console.log('- Search:', globalShortcut.isRegistered(config.KEYBIND_SEARCH));
  console.log('- Chat:', globalShortcut.isRegistered(config.KEYBIND_CHAT));
  console.log('- Close:', globalShortcut.isRegistered(config.KEYBIND_CLOSE));
}

// App lifecycle events
app.whenReady().then(async () => {
  // Initialize API service first
  await apiService.init();
  
  createMainWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
    registerShortcuts();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 