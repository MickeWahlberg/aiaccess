const { ipcRenderer } = require('electron');

// Single global instance
let searchWindow = null;

class SearchWindow {
    constructor() {
        console.log('Search window initializing...');
        this.overlay = document.querySelector('.search-overlay');
        this.input = document.querySelector('.search-input');
        this.isVisible = false;
        
        // Debug info
        console.log('Overlay element:', this.overlay);
        console.log('Input element:', this.input);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Show initially
        this.show();

        // Add handler for reset - this is called from main process
        ipcRenderer.on('reset-search', () => {
            console.log('Reset search received');
            if (this.input) {
                this.input.value = '';
                this.input.focus();
            }
            this.show();
        });
    }

    setupEventListeners() {
        // Only handle Enter key for search submission
        // Escape and CMD+K are handled by main process
        document.addEventListener('keydown', (e) => {
            // Handle Enter key
            if (e.key === 'Enter' && this.isVisible) {
                e.preventDefault();
                this.handleSearch();
            }
        });
    }

    show() {
        console.log('Showing search window...');
        if (!this.overlay) return;
        
        this.overlay.classList.add('visible');
        this.isVisible = true;
        
        // Delay focus slightly to ensure window is fully rendered
        setTimeout(() => {
            if (this.input) {
                this.input.focus();
            }
        }, 100);
    }

    hide() {
        if (!this.overlay) return;
        
        this.overlay.classList.remove('visible');
        this.isVisible = false;
    }

    handleSearch() {
        if (!this.input) return;
        
        const query = this.input.value.trim();
        if (query) {
            console.log('Sending search query:', query);
            // Send the search query to the main process
            ipcRenderer.send('search-query', query);
            this.hide();
        }
    }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SearchWindow();
    console.log('Search window initialized');
}); 