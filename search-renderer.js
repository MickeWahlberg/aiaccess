const { ipcRenderer } = require('electron');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  
  // Auto-resize textarea based on content
  function autoResizeTextarea() {
    // Reset height to auto so we can determine the scroll height
    searchInput.style.height = 'auto';
    
    // Set the height to match the content (the scrollHeight)
    searchInput.style.height = (searchInput.scrollHeight) + 'px';
    
    // Notify the main process to resize the window
    ipcRenderer.send('resize-search-window', searchInput.scrollHeight + 24); // Extra padding
  }
  
  // Call the resize function whenever input changes
  searchInput.addEventListener('input', autoResizeTextarea);
  
  // Handle form submission
  searchInput.addEventListener('keydown', (event) => {
    // Get the close keybind from the environment
    const closeKey = process.env.KEYBIND_CLOSE || 'Escape';
    
    if (event.key === 'Enter') {
      // If Shift key is pressed, allow a new line
      if (event.shiftKey) {
        return; // Allows the default behavior (inserting a new line)
      }
      
      // Prevent default behavior (which would be a new line in a textarea)
      event.preventDefault();
      
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