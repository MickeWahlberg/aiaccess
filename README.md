# AI Chat App for macOS

A lightweight macOS application that provides quick access to AI chat functionality through global shortcuts.

## Features

- Global shortcut (CMD+K) to open a search/question input field
- Global shortcut (CMD+Shift+K) to open the main chat window directly
- Escape key to close windows
- Menubar icon for easy access
- Simple chat interface with dark mode
- Code syntax highlighting for multiple programming languages
- Copy button for code blocks
- Flexible AI API integration
- Lightweight and minimal design

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- macOS
- API key for your preferred AI service

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/ai-chat-app.git
   cd ai-chat-app
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure your AI API:
   - The application uses a `.env` file to store your API configuration
   - The file should already contain the necessary variables:
     ```
     AI_API_KEY="your-api-key-here"
     AI_MODEL="default-model"
     AI_API_URL="https://api.example.com/chat/completions"
     ```
   - Replace `your-api-key-here` with your actual API key
   - Update the model name and API URL to match your chosen AI service

4. Run the application:
   ```
   npm start
   ```

## AI API Integration

This application is designed to work with any AI API that follows the chat completions format. You can configure the following settings in your `.env` file:

- `AI_API_KEY`: Your API key
- `AI_MODEL`: The model name to use
- `AI_API_URL`: The endpoint URL for the API

The application is compatible with various AI services that follow a similar API structure, including OpenAI, Anthropic, and others.

## Building the Application

To build the application as a standalone macOS app:

```
npm run build
```

The built application will be available in the `dist` directory.

## Usage

- Press `CMD+K` anywhere to open the search/question input field
- Press `CMD+Shift+K` anywhere to open the main chat window directly
- Press `Escape` to close any window
- Type your question and press Enter
- View the AI's response in the chat window
- The app is also accessible from the menubar icon
- Use the copy button to easily copy code blocks

## Customization

- To change the global shortcut, modify the `globalShortcut.register` call in `index.js`
- To customize the UI, modify the CSS in the HTML files
- To change the AI API model or parameters, update the values in the `.env` file

## License

ISC 