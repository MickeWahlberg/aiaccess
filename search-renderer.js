const { ipcRenderer } = require('electron');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  
  // Handle form submission
  searchInput.addEventListener('keydown', (event) => {
    // Get the close keybind from the environment
    const closeKey = process.env.KEYBIND_CLOSE || 'Escape';
    
    if (event.key === 'Enter') {
      const query = searchInput.value.trim();
      
      if (query) {
        // Send the query to the main process
        ipcRenderer.send('search-query', query);
        
        // Clear the input
        searchInput.value = '';
      } else {
        // If the query is empty, hide the window
        ipcRenderer.send('hide-search-window');
      }
    } else if (event.key === 'Escape' || (closeKey === 'Escape' && event.key === 'Escape')) {
      // Hide the window when the configured close key is pressed
      ipcRenderer.send('hide-search-window');
    }
  });
  
  // Keep focus on the input field
  window.addEventListener('focus', () => {
    searchInput.focus();
  });
  
  // Prevent the window from losing focus
  document.addEventListener('click', (event) => {
    event.preventDefault();
    searchInput.focus();
  });
}); 