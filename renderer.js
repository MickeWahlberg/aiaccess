const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Import the API module
const api = require('./api');

// Import the storage module
const storage = require('./storage');

// Import our formatter utility
const formatter = require('./utils/formatter');

// Load environment variables for UI configuration
dotenv.config();

// Global variables
let chatContainer;
let messageInput;
let sendButton;
let currentConversation;
let historyList;
let historySidebar;
let toggleHistoryBtn;
let mainContent;
let testButton;

// Function to format markdown-like syntax in text
function formatMessage(text) {
  // Use our formatter utility to process the text
  return formatter.formatText(text);
}

// Function to copy code to clipboard
window.copyToClipboard = function(codeElement) {
  const textToCopy = codeElement.textContent;
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    const button = codeElement.closest('.code-block-wrapper').querySelector('.copy-button');
    const originalText = button.textContent;
    
    // Add the 'copied' class for styling
    button.classList.add('copied');
    button.textContent = 'Copied!';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
};

// Function to test the formatting
async function testFormatting() {
  try {
    // Get test response from API
    const response = await api.getTestResponse();
    
    // Add the test response to the chat
    addMessage(response.text, false);
  } catch (error) {
    console.error('Error testing formatting:', error);
    addMessage(`Error testing formatting: ${error.message}`, false);
  }
}

// Function to add a message to the chat
function addMessage(text, isUser) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  messageElement.classList.add(isUser ? 'user-message' : 'ai-message');
  
  if (isUser) {
    messageElement.textContent = text;
  } else {
    messageElement.innerHTML = formatMessage(text);
  }
  
  chatContainer.appendChild(messageElement);
  
  // Handle scrolling based on message type
  if (isUser) {
    // For user messages, scroll to the bottom as before
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else {
    // For AI messages, scroll to the top of this message
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  
  // Save the message to the current conversation if it's not already there
  if (currentConversation) {
    // Check if this exact message already exists in the conversation
    const messageExists = currentConversation.messages.some(msg => 
      msg.text === text && msg.isUser === isUser
    );
    
    // Only add the message if it doesn't already exist
    if (!messageExists) {
      currentConversation.messages.push({
        text,
        isUser,
        timestamp: new Date().toISOString()
      });
      
      // Update the conversation title if it's a new conversation with only one user message
      if (currentConversation.messages.length === 2 && currentConversation.title === 'New Conversation') {
        // Use the first user message as the title, truncated if needed
        currentConversation.title = text.length > 30 ? text.substring(0, 30) + '...' : text;
      }
      
      // Save the updated conversation
      storage.saveConversation(currentConversation);
      
      // Refresh the history list
      loadChatHistory();
    }
  }
}

// Function to send a message
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  
  // Create a new conversation if none exists
  if (!currentConversation) {
    currentConversation = storage.createConversation();
  }
  
  // Add the user message to the chat
  addMessage(message, true);
  
  // Clear the input
  messageInput.value = '';
  
  // Show loading indicator
  document.getElementById('loading-dots').style.display = 'block';
  
  try {
    // Call the AI API using the imported module
    const response = await api.callAI(message);
    
    // Hide loading indicator
    document.getElementById('loading-dots').style.display = 'none';
    
    // Add the AI response to the chat
    if (response.error) {
      addMessage(`Error: ${response.error}`, false);
    } else {
      addMessage(response.text || 'No response from AI', false);
    }
  } catch (error) {
    // Hide loading indicator
    document.getElementById('loading-dots').style.display = 'none';
    
    // Add error message to the chat
    addMessage(`Error: ${error.message}`, false);
  }
}

// Function to load chat history
function loadChatHistory() {
  // Clear the history list
  historyList.innerHTML = '';
  
  // Get all conversations
  const conversations = storage.loadConversations();
  
  if (conversations.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'history-empty';
    emptyMessage.textContent = 'No conversations yet';
    historyList.appendChild(emptyMessage);
    return;
  }
  
  // Sort conversations by timestamp (newest first)
  conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Add each conversation to the history list
  conversations.forEach(conversation => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    // Mark the current conversation as active
    if (currentConversation && conversation.id === currentConversation.id) {
      historyItem.classList.add('active');
    }
    
    // Create title element
    const titleElement = document.createElement('div');
    titleElement.className = 'history-item-title';
    titleElement.textContent = conversation.title;
    
    // Create date element
    const dateElement = document.createElement('div');
    dateElement.className = 'history-item-date';
    dateElement.textContent = formatDate(conversation.timestamp);
    
    // Create delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-conversation-btn';
    deleteButton.innerHTML = '×'; // Using the multiplication symbol as an X
    deleteButton.title = 'Delete conversation';
    
    // Add click event to delete the conversation
    deleteButton.addEventListener('click', (event) => {
      // Stop the click event from bubbling up to the history item
      event.stopPropagation();
      
      // Delete the conversation
      deleteConversation(conversation.id);
    });
    
    // Add elements to history item
    historyItem.appendChild(titleElement);
    historyItem.appendChild(dateElement);
    historyItem.appendChild(deleteButton);
    
    // Add click event to load the conversation
    historyItem.addEventListener('click', () => {
      loadConversation(conversation);
    });
    
    // Add the history item to the list
    historyList.appendChild(historyItem);
  });
}

// Function to delete a conversation
function deleteConversation(conversationId) {
  // Delete the conversation from storage
  storage.deleteConversation(conversationId);
  
  // If the deleted conversation is the current one, start a new conversation
  if (currentConversation && currentConversation.id === conversationId) {
    startNewConversation();
  } else {
    // Otherwise, just refresh the history list
    loadChatHistory();
  }
}

// Function to load a conversation
function loadConversation(conversation) {
  // Check if we're trying to load the same conversation that's already loaded
  if (currentConversation && currentConversation.id === conversation.id) {
    return; // Don't reload the same conversation
  }
  
  // Set the current conversation
  currentConversation = conversation;
  
  // Clear the chat container
  chatContainer.innerHTML = '';
  
  // Add each message to the chat
  conversation.messages.forEach((message, index) => {
    // Temporarily disable scrolling behavior during conversation loading
    const originalScrollTop = chatContainer.scrollTop;
    
    // Add the message
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(message.isUser ? 'user-message' : 'ai-message');
    
    if (message.isUser) {
      messageElement.textContent = message.text;
    } else {
      messageElement.innerHTML = formatMessage(message.text);
    }
    
    chatContainer.appendChild(messageElement);
    
    // Restore original scroll position to prevent automatic scrolling during loading
    chatContainer.scrollTop = originalScrollTop;
  });
  
  // After loading all messages, scroll to the top of the conversation
  if (chatContainer.firstChild) {
    chatContainer.scrollTop = 0;
  }
  
  // Refresh the history list to update the active item
  loadChatHistory();
  
  // Close the sidebar on mobile
  if (window.innerWidth < 768) {
    toggleSidebar(false);
  }
}

// Function to start a new conversation
function startNewConversation() {
  // Create a new conversation
  currentConversation = storage.createConversation();
  
  // Clear the chat container
  chatContainer.innerHTML = '';
  
  // Add a welcome message
  const welcomeMessage = 'Hello! How can I help you today?';
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', 'ai-message');
  messageElement.innerHTML = formatMessage(welcomeMessage);
  chatContainer.appendChild(messageElement);
  
  // Store the welcome message in the conversation
  currentConversation.messages.push({
    text: welcomeMessage,
    isUser: false,
    timestamp: new Date().toISOString()
  });
  
  // Scroll to the top of the welcome message
  messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  // Refresh the history list
  loadChatHistory();
}

// Function to toggle the sidebar
function toggleSidebar(forceState) {
  const isOpen = typeof forceState !== 'undefined' ? forceState : !historySidebar.classList.contains('open');
  
  if (isOpen) {
    historySidebar.classList.add('open');
    toggleHistoryBtn.classList.add('open');
    mainContent.classList.add('sidebar-open');
  } else {
    historySidebar.classList.remove('open');
    toggleHistoryBtn.classList.remove('open');
    mainContent.classList.remove('sidebar-open');
  }
}

// Helper function to format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  
  // If the date is today, show the time
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // If the date is yesterday, show "Yesterday"
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // Otherwise, show the date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize storage
  storage.init();
  
  // Get DOM elements
  chatContainer = document.getElementById('chat-container');
  messageInput = document.getElementById('message-input');
  sendButton = document.getElementById('send-button');
  historyList = document.getElementById('history-list');
  historySidebar = document.getElementById('history-sidebar');
  toggleHistoryBtn = document.getElementById('toggle-history');
  mainContent = document.querySelector('.main-content');
  //testButton = document.getElementById('test-button');
  
  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Add event listener for the toggle history button
  toggleHistoryBtn.addEventListener('click', () => {
    toggleSidebar();
  });
  
  // Add event listener for Escape key to close the window
  document.addEventListener('keydown', (event) => {
    // Get the close keybind from the environment
    const closeKey = process.env.KEYBIND_CLOSE || 'Escape';
    
    // Check if the pressed key matches the configured close key
    if (event.key === 'Escape' || (closeKey === 'Escape' && event.key === 'Escape')) {
      // Send a message to the main process to hide the window
      ipcRenderer.send('hide-main-window');
    }
  });
  
  // Listen for new queries from the search window
  ipcRenderer.on('new-query', (event, query, isNewConversation) => {
    console.log('Received query:', query);
    
    // If this is a new conversation from CMD+K, start a new one
    if (isNewConversation) {
      startNewConversation();
    }
    
    // Set the query in the input field
    messageInput.value = query;
    
    // Send the message
    sendMessage();
  });
  
  // Get keybinding configuration from environment variables
  const KEYBIND_SEARCH = process.env.KEYBIND_SEARCH || 'CommandOrControl+K';
  const KEYBIND_CHAT = process.env.KEYBIND_CHAT || 'CommandOrControl+Shift+K';
  
  // Format the keybinds for display
  const formattedSearchKeybind = formatKeybind(KEYBIND_SEARCH);
  const formattedChatKeybind = formatKeybind(KEYBIND_CHAT);
  
  // Inform the main process that the renderer is ready
  ipcRenderer.send('renderer-ready');
  
  // Start a new conversation
  startNewConversation();
  
  // Load chat history
  loadChatHistory();
  
  // Update the shortcut hint text
  document.querySelector('.shortcut-hint').innerHTML = `Press <kbd>${formattedSearchKeybind}</kbd> anywhere to quickly ask a question or <kbd>${formattedChatKeybind}</kbd> to open this window`;
  
  // Add a "New Chat" button to the history header
  const historyHeader = document.querySelector('.history-header');
  const newChatButton = document.createElement('button');
  newChatButton.className = 'new-chat-btn';
  newChatButton.textContent = '+ New';
  newChatButton.addEventListener('click', startNewConversation);
  historyHeader.appendChild(newChatButton);
  
  // Add event listener for the test button
  //testButton.addEventListener('click', testFormatting);
}); 