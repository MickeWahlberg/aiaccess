// Load environment variables
require('dotenv').config();

const { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable debugging
console.log('Starting application...');

// Get keybinding configuration from environment variables
const KEYBIND_SEARCH = process.env.KEYBIND_SEARCH || 'CommandOrControl+K';
const KEYBIND_CHAT = process.env.KEYBIND_CHAT || 'CommandOrControl+Shift+K';
const KEYBIND_CLOSE = process.env.KEYBIND_CLOSE || 'Escape';

// Keep a global reference of the window objects
let mainWindow = null;
let searchWindow = null;
let tray = null;
let isQuitting = false;

// Create the main chat window
function createMainWindow() {
  console.log('Creating main window');
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false // Don't show the window initially
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show the window when it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Hide the window when it's closed instead of quitting the app
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  // Create tray icon
  createTray();
}

// Create the search/input window
function createSearchWindow() {
  console.log('Creating search window');
  
  // If there's an existing search window that's not destroyed, destroy it first
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.destroy();
  }
  
  // Create the browser window
  searchWindow = new BrowserWindow({
    width: 600,
    height: 60,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false
  });

  // Load the search.html file
  searchWindow.loadFile('search.html');

  // Wait for the window to be ready before setting up event handlers
  searchWindow.once('ready-to-show', () => {
    console.log('Search window ready to show');
  });

  // Handle window errors
  searchWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Search window failed to load:', errorDescription);
    // Try to recreate the window if it fails to load
    setTimeout(createSearchWindow, 1000);
  });
}

// Create the menubar/tray icon
function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Chat', 
      click: () => {
        // Make the main window visible on all workspaces temporarily
        // This ensures it opens on the current space/desktop
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        
        mainWindow.show();
        mainWindow.focus();
        
        // After a short delay, set it back to normal behavior
        setTimeout(() => {
          mainWindow.setVisibleOnAllWorkspaces(false);
        }, 100);
      }
    },
    { 
      label: `New Query (${formatKeybind(KEYBIND_SEARCH)})`, 
      click: () => {
        // If the search window is already visible, just focus it
        if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
          // Make the search window visible on all workspaces temporarily
          // This ensures it stays on the current space/desktop
          searchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
          
          searchWindow.focus();
          
          // After a short delay, set it back to normal behavior
          setTimeout(() => {
            if (searchWindow && !searchWindow.isDestroyed()) {
              searchWindow.setVisibleOnAllWorkspaces(false);
            }
          }, 100);
        } else {
          // Otherwise, show the search window
          showSearchWindow();
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('AI Chat App');
  tray.setContextMenu(contextMenu);
  
  // Show main window when tray icon is clicked
  tray.on('click', () => {
    // Make the main window visible on all workspaces temporarily
    // This ensures it opens on the current space/desktop
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    mainWindow.show();
    mainWindow.focus();
    
    // After a short delay, set it back to normal behavior
    setTimeout(() => {
      mainWindow.setVisibleOnAllWorkspaces(false);
    }, 100);
  });
}

// Helper function to format keybind for display
function formatKeybind(keybind) {
  return keybind
    .replace('CommandOrControl', process.platform === 'darwin' ? 'CMD' : 'CTRL')
    .replace('Command', 'CMD')
    .replace('Control', 'CTRL')
    .replace('Shift', 'SHIFT')
    .replace('Alt', 'ALT')
    .replace('Meta', 'META');
}

// Function to show the search window
function showSearchWindow() {
  console.log('Showing search window');
  
  if (!searchWindow || searchWindow.isDestroyed()) {
    console.log('Search window does not exist or was destroyed, creating new one');
    createSearchWindow();
    
    // Wait for the window to be ready before showing it
    searchWindow.once('ready-to-show', () => {
      positionAndShowSearchWindow();
      // Clear the search input when shown
      searchWindow.webContents.executeJavaScript('document.getElementById("search-input").value = "";');
      searchWindow.webContents.executeJavaScript('document.getElementById("search-input").focus();');
    });
  } else {
    positionAndShowSearchWindow();
    // Clear the search input when shown
    searchWindow.webContents.executeJavaScript('document.getElementById("search-input").value = "";');
    searchWindow.webContents.executeJavaScript('document.getElementById("search-input").focus();');
  }
}

// Helper function to position and show the search window
function positionAndShowSearchWindow() {
  // Center the search window on the screen
  const { width, height } = searchWindow.getBounds();
  const screenBounds = require('electron').screen.getPrimaryDisplay().bounds;
  const x = Math.round(screenBounds.x + (screenBounds.width - width) / 2);
  const y = Math.round(screenBounds.y + (screenBounds.height - height) / 4);
  
  searchWindow.setPosition(x, y);
  
  // Make the search window visible on all workspaces temporarily
  // This ensures it opens on the current space/desktop
  searchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // Make sure the window is visible and focused
  searchWindow.show();
  searchWindow.focus();
  
  // After a short delay, set it back to normal behavior
  setTimeout(() => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.setVisibleOnAllWorkspaces(false);
    }
  }, 100);
  
  // Force focus after a short delay to ensure it gets focus
  setTimeout(() => {
    if (searchWindow && !searchWindow.isDestroyed()) {
      searchWindow.focus();
      console.log('Ensuring search window has focus');
    }
  }, 200); // Increased to 200ms to ensure it happens after the workspace visibility change
  
  console.log('Search window positioned and shown');
}

// Handle IPC messages from the renderer process
ipcMain.on('search-query', (event, query) => {
  console.log('Received search query:', query);
  
  // Make the main window visible on all workspaces temporarily
  // This ensures it opens on the current space/desktop
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  // Show the main window
  mainWindow.show();
  mainWindow.focus(); // Ensure the main window has focus
  
  // After a short delay, set it back to normal behavior
  setTimeout(() => {
    mainWindow.setVisibleOnAllWorkspaces(false);
  }, 100);
  
  // Send the query to the main window to start a new conversation
  mainWindow.webContents.send('new-query', query, true);
  
  // Hide the search window
  searchWindow.hide();
});

// Handle request to hide the search window
ipcMain.on('hide-search-window', () => {
  console.log('Hiding search window (Escape pressed)');
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.hide();
  }
});

// Handle request to hide the main window when Escape is pressed
ipcMain.on('hide-main-window', () => {
  console.log('Hiding main window (Escape pressed)');
  if (mainWindow) {
    mainWindow.hide();
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  console.log('App is ready');
  
  // Create a default icon if it doesn't exist
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    // Create a simple icon (1x1 pixel transparent PNG)
    const iconData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(iconPath, iconData);
    console.log('Created default icon');
  }
  
  createMainWindow();

  // Register the global shortcut for search
  globalShortcut.register(KEYBIND_SEARCH, () => {
    console.log(`Global shortcut triggered: ${KEYBIND_SEARCH}`);
    
    // If the search window is already visible, just focus it
    if (searchWindow && !searchWindow.isDestroyed() && searchWindow.isVisible()) {
      console.log('Search window already visible, focusing it');
      
      // Make the search window visible on all workspaces temporarily
      // This ensures it stays on the current space/desktop
      searchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      searchWindow.focus();
      
      // After a short delay, set it back to normal behavior
      setTimeout(() => {
        if (searchWindow && !searchWindow.isDestroyed()) {
          searchWindow.setVisibleOnAllWorkspaces(false);
        }
      }, 100);
      
      return;
    }
    
    // Otherwise, show the search window
    showSearchWindow();
  });
  
  // Register global shortcut to show the main chat window
  globalShortcut.register(KEYBIND_CHAT, () => {
    console.log(`Chat window shortcut triggered: ${KEYBIND_CHAT}`);
    
    // Make the main window visible on all workspaces temporarily
    // This ensures it opens on the current space/desktop
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Show and focus the main window
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      
      // After a short delay, set it back to normal behavior
      setTimeout(() => {
        mainWindow.setVisibleOnAllWorkspaces(false);
      }, 100);
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create the window when the dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else {
    // Make the main window visible on all workspaces temporarily
    // This ensures it opens on the current space/desktop
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    mainWindow.show();
    mainWindow.focus();
    
    // After a short delay, set it back to normal behavior
    setTimeout(() => {
      mainWindow.setVisibleOnAllWorkspaces(false);
    }, 100);
  }
});

// Handle the app quitting
app.on('before-quit', () => {
  isQuitting = true;
}); 