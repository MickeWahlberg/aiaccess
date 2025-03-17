const fs = require('fs');
const path = require('path');

// Define the storage directory and file
const STORAGE_DIR = path.join(__dirname, 'data');
const CONVERSATIONS_FILE = path.join(STORAGE_DIR, 'conversations.json');

// Ensure the storage directory exists
function ensureStorageExists() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations: [] }));
  }
}

// Load all conversations
function loadConversations() {
  ensureStorageExists();
  
  try {
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    return JSON.parse(data).conversations;
  } catch (error) {
    console.error('Error loading conversations:', error);
    return [];
  }
}

// Save a conversation
function saveConversation(conversation) {
  ensureStorageExists();
  
  try {
    // Load existing conversations
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    const { conversations } = JSON.parse(data);
    
    // Check if this conversation already exists
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);
    
    if (existingIndex >= 0) {
      // Update existing conversation
      conversations[existingIndex] = conversation;
    } else {
      // Add new conversation
      conversations.push(conversation);
    }
    
    // Save back to file
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations }, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error saving conversation:', error);
    return false;
  }
}

// Delete a conversation
function deleteConversation(conversationId) {
  ensureStorageExists();
  
  try {
    // Load existing conversations
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    let { conversations } = JSON.parse(data);
    
    // Filter out the conversation to delete
    conversations = conversations.filter(c => c.id !== conversationId);
    
    // Save back to file
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations }, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return false;
  }
}

// Create a new conversation
function createConversation(title = 'New Conversation') {
  const id = Date.now().toString();
  const timestamp = new Date().toISOString();
  
  return {
    id,
    title,
    timestamp,
    messages: []
  };
}

// Add .gitignore entry for the data directory
function setupGitIgnore() {
  const gitignorePath = path.join(__dirname, '.gitignore');
  
  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    // Check if data/ is already in .gitignore
    if (!content.includes('data/')) {
      content += '\n# Local storage\ndata/\n';
      fs.writeFileSync(gitignorePath, content);
    }
  } catch (error) {
    console.error('Error updating .gitignore:', error);
  }
}

// Initialize storage
function init() {
  ensureStorageExists();
  setupGitIgnore();
}

module.exports = {
  init,
  loadConversations,
  saveConversation,
  deleteConversation,
  createConversation
}; 