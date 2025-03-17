/**
 * API integration module for AI Chat App
 * This file handles all API-related functionality, making it easy to swap out
 * for different AI providers in the future.
 */

// Load environment variables
const dotenv = require('dotenv');
dotenv.config();

// Get API configuration from environment variables
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'default-model';
const AI_API_URL = process.env.AI_API_URL || 'https://api.example.com/chat/completions';

// Store conversation contexts in memory
const conversationContexts = new Map();

/**
 * Call the AI API with a user query
 * @param {string} query - The user's message/query
 * @param {string} conversationId - Optional conversation ID for continuing a conversation
 * @returns {Promise<Object>} - Response object with text or error
 */
async function callAI(query, conversationId = null) {
  // Check if API key is available
  if (!AI_API_KEY) {
    return { 
      error: "AI API key is not set in the .env file. Please add your API key and restart the application." 
    };
  }
  
  try {
    // Get or create conversation messages
    let messages = [
      { 
        role: 'system', 
        content: 'You are a helpful assistant. When providing code examples, always use markdown code blocks with language specification. For lists, use proper markdown formatting. For emphasis, use **bold** text.' 
      }
    ];
    
    // If we have a conversation ID and it exists in our contexts, use those messages
    if (conversationId && conversationContexts.has(conversationId)) {
      messages = [...conversationContexts.get(conversationId)];
    }
    
    // Add the new user message
    messages.push({ role: 'user', content: query });
    
    // Call AI API
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', errorData);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Add the AI response to the messages
    messages.push({ role: 'assistant', content: aiResponse });
    
    // Store the updated messages for this conversation
    const newConversationId = conversationId || Date.now().toString();
    conversationContexts.set(newConversationId, messages);
    
    return { 
      text: aiResponse,
      conversationId: newConversationId,
      messages: messages.slice(1) // Remove the system message
    };
  } catch (error) {
    console.error('Error calling AI API:', error);
    return { error: `Failed to get response from AI API: ${error.message}` };
  }
}

/**
 * Get the message history for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Array} - Array of messages or empty array if not found
 */
function getConversationMessages(conversationId) {
  if (conversationContexts.has(conversationId)) {
    // Return a copy of the messages without the system message
    return [...conversationContexts.get(conversationId)].slice(1);
  }
  return [];
}

/**
 * Set the message history for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {Array} messages - Array of messages (should include system message)
 */
function setConversationMessages(conversationId, messages) {
  // Ensure the first message is a system message
  if (!messages.length || messages[0].role !== 'system') {
    messages = [
      { 
        role: 'system', 
        content: 'You are a helpful assistant. When providing code examples, always use markdown code blocks with language specification. For lists, use proper markdown formatting. For emphasis, use **bold** text.' 
      },
      ...messages
    ];
  }
  
  conversationContexts.set(conversationId, messages);
}

// Export the API functions
module.exports = {
  callAI,
  getConversationMessages,
  setConversationMessages
}; 