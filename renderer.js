const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Import the API module
const api = require('./api');

// Import the storage module
const storage = require('./storage');

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

// Function to format markdown-like syntax in text
function formatMessage(text) {
  // Store code blocks temporarily to prevent formatting within them
  const codeBlocks = [];
  
  // Extract code blocks and replace with placeholders - improved regex to handle edge cases
  text = text.replace(/```([\w-]*)\s*\n([\s\S]*?)```/g, function(match, language, code) {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    // Trim trailing newlines but preserve internal ones
    const trimmedCode = code.replace(/\n+$/, '');
    codeBlocks.push({ language: language || '', code: trimmedCode });
    return placeholder;
  });
  
  // Store math expressions temporarily to prevent formatting within them
  const mathExpressions = [];
  
  // Extract math expressions and replace with placeholders
  // Match both \[ ... \] and $ ... $ formats
  text = text.replace(/(\\\[)([\s\S]*?)(\\\])|(\$)([\s\S]*?)(\$)/g, function(match, open1, content1, close1, open2, content2, close2) {
    const placeholder = `__MATH_EXPRESSION_${mathExpressions.length}__`;
    // Use the content from whichever format matched
    const content = content1 || content2;
    mathExpressions.push(content.trim());
    return placeholder;
  });
  
  // Format headers - improved regex to handle various header formats
  text = text.replace(/^(#{1,3})\s+(.*?)$/gm, function(match, hashes, content) {
    const level = hashes.length;
    return `<h${level}>${content}</h${level}>`;
  });
  
  // Format bold text
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Format unordered lists
  text = text.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>').replace(/<li>.*?<\/li>/gs, '<ul>$&</ul>');
  
  // Format ordered lists - improved to handle consecutive numbered items properly
  // Using a similar approach to unordered lists for consistency
  const orderedListRegex = /(?:^\s*\d+\.\s+.*?$\n?)+/gm;
  text = text.replace(orderedListRegex, function(match) {
    // Convert each line to a list item
    const listItems = match.replace(/^\s*\d+\.\s+(.*?)$/gm, '<li>$1</li>');
    // Wrap in an ordered list
    return `<ol>${listItems}</ol>`;
  });
  
  // Remove duplicate list tags
  text = text.replace(/<\/ul><ul>/g, '').replace(/<\/ol><ol>/g, '');
  
  // Restore code blocks with proper HTML and language-specific styling
  for (let i = 0; i < codeBlocks.length; i++) {
    const { language, code } = codeBlocks[i];
    const placeholder = `__CODE_BLOCK_${i}__`;
    
    // First escape HTML in the code to prevent tags from being interpreted
    const escapedCode = escapeHtml(code);
    
    // Get language-specific class
    const langClass = getLanguageClass(language);
    
    // Apply syntax highlighting to the escaped code
    let highlightedCode = escapedCode;
    
    try {
      // Only apply syntax highlighting if we have a language
      if (language) {
        // First, we need to unescape the HTML to apply syntax highlighting
        const unescapedCode = unescapeHtml(escapedCode);
        
        // Apply syntax highlighting
        const highlighted = highlightSyntax(unescapedCode, language);
        
        // Re-escape the HTML in the highlighted code
        highlightedCode = highlighted;
      }
    } catch (error) {
      console.error('Error highlighting code:', error);
      // Fall back to the escaped code without highlighting
      highlightedCode = escapedCode;
    }
    
    // Create the code block HTML
    const codeBlockHtml = `<div class="code-block-wrapper"><button class="copy-button" onclick="copyToClipboard(this.nextElementSibling.querySelector('code'))">Copy</button><pre><code class="${langClass}">${highlightedCode}</code></pre></div>`;
    
    // Replace the placeholder with the code block HTML
    text = text.replace(placeholder, codeBlockHtml);
  }
  
  // Restore math expressions with proper HTML styling
  for (let i = 0; i < mathExpressions.length; i++) {
    const expression = mathExpressions[i];
    const placeholder = `__MATH_EXPRESSION_${i}__`;
    
    // Escape HTML in the math expression
    const escapedExpression = escapeHtml(expression);
    
    // Format the math expression
    const formattedExpression = formatMathExpression(escapedExpression);
    
    // Create the math expression HTML
    const mathHtml = `<div class="math-expression">${formattedExpression}</div>`;
    
    // Replace the placeholder with the math expression HTML
    text = text.replace(placeholder, mathHtml);
  }
  
  // Handle special case for math expressions that might not be properly captured
  // This is for the specific format shown in the screenshot
  text = text.replace(/(\d+)\s*-\s*operator">=\s*"math\s*-\s*thin\s*-\s*space">\s*(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\s*[×x]\s*(\d+)\s*-\s*operator">=\s*(\d+)\s*-\s*operator">=\s*"math\s*-\s*thin\s*-\s*space">\s*(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\s*-\s*operator">=\s*(\d+)\s*-\s*operator">=\s*"math\s*-\s*thin\s*-\s*space">\s*(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)/g, function(match, num1, unit1, multiplier, result1, unit2, result2, unit3) {
    return `<div class="math-expression">${num1} <span class="math-unit">${unit1}</span> <span class="math-operator">&times;</span> ${multiplier} = ${result1} <span class="math-unit">${unit2}</span> = ${result2} <span class="math-unit">${unit3}</span></div>`;
  });
  
  // Handle another common pattern seen in the screenshot
  text = text.replace(/(\d+)\s+(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\s*[×x]\s*(\d+)\s*=\s*(\d+)\s+(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\s*=\s*(\d+)\s+(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)/g, function(match, num1, unit1, multiplier, result1, unit2, result2, unit3) {
    return `<div class="math-expression">${num1} <span class="math-unit">${unit1}</span> <span class="math-operator">&times;</span> ${multiplier} <span class="math-operator">=</span> ${result1} <span class="math-unit">${unit2}</span> <span class="math-operator">=</span> ${result2} <span class="math-unit">${unit3}</span></div>`;
  });
  
  // Handle the raw text pattern that might appear in the output
  text = text.replace(/(\d+)\s+-\s+operator">=\s+"math\s+-\s+thin\s+-\s+space">\s+kg\s+×\s+(\d+)\s+-\s+operator">=\s+(\d+)\s+-\s+operator">=\s+"math\s+-\s+thin\s+-\s+space">\s+kg\s+-\s+operator">=\s+(\d+)\s+-\s+operator">=\s+"math\s+-\s+thin\s+-\s+space">\s+(tonne|tonnes)/g, function(match, num1, multiplier, result1, result2, unit3) {
    return `<div class="math-expression">${num1} <span class="math-unit">kg</span> <span class="math-operator">&times;</span> ${multiplier} <span class="math-operator">=</span> ${result1} <span class="math-unit">kg</span> <span class="math-operator">=</span> ${result2} <span class="math-unit">${unit3}</span></div>`;
  });
  
  return text;
}

// Function to format math expressions
function formatMathExpression(expression) {
  // Special case for the specific format in the screenshot
  if (expression.match(/\d+\s*\\,\s*\\text\{kg\}\s*\\times\s*\d+\s*=\s*\d+\s*\\,\s*\\text\{kg\}\s*=\s*\d+\s*\\,\s*\\text\{tonne\}/)) {
    return expression
      .replace(/(\d+)\s*\\,\s*\\text\{kg\}\s*\\times\s*(\d+)\s*=\s*(\d+)\s*\\,\s*\\text\{kg\}\s*=\s*(\d+)\s*\\,\s*\\text\{tonne\}/g, 
        '$1 <span class="math-unit">kg</span> <span class="math-operator">&times;</span> $2 <span class="math-operator">=</span> $3 <span class="math-unit">kg</span> <span class="math-operator">=</span> $4 <span class="math-unit">tonne</span>');
  }
  
  // Special case for the plural "tonnes" format
  if (expression.match(/\d+\s*\\,\s*\\text\{kg\}\s*\\times\s*\d+\s*=\s*\d+\s*\\,\s*\\text\{kg\}\s*=\s*\d+\s*\\,\s*\\text\{tonnes\}/)) {
    return expression
      .replace(/(\d+)\s*\\,\s*\\text\{kg\}\s*\\times\s*(\d+)\s*=\s*(\d+)\s*\\,\s*\\text\{kg\}\s*=\s*(\d+)\s*\\,\s*\\text\{tonnes\}/g, 
        '$1 <span class="math-unit">kg</span> <span class="math-operator">&times;</span> $2 <span class="math-operator">=</span> $3 <span class="math-unit">kg</span> <span class="math-operator">=</span> $4 <span class="math-unit">tonnes</span>');
  }
  
  // Another special case for the format without the \, (thin space)
  if (expression.match(/\d+\s*\\text\{kg\}\s*\\times\s*\d+\s*=\s*\d+\s*\\text\{kg\}\s*=\s*\d+\s*\\text\{tonne\}/)) {
    return expression
      .replace(/(\d+)\s*\\text\{kg\}\s*\\times\s*(\d+)\s*=\s*(\d+)\s*\\text\{kg\}\s*=\s*(\d+)\s*\\text\{tonne\}/g, 
        '$1 <span class="math-unit">kg</span> <span class="math-operator">&times;</span> $2 <span class="math-operator">=</span> $3 <span class="math-unit">kg</span> <span class="math-operator">=</span> $4 <span class="math-unit">tonne</span>');
  }
  
  // Special case for the plural "tonnes" format without the \, (thin space)
  if (expression.match(/\d+\s*\\text\{kg\}\s*\\times\s*\d+\s*=\s*\d+\s*\\text\{kg\}\s*=\s*\d+\s*\\text\{tonnes\}/)) {
    return expression
      .replace(/(\d+)\s*\\text\{kg\}\s*\\times\s*(\d+)\s*=\s*(\d+)\s*\\text\{kg\}\s*=\s*(\d+)\s*\\text\{tonnes\}/g, 
        '$1 <span class="math-unit">kg</span> <span class="math-operator">&times;</span> $2 <span class="math-operator">=</span> $3 <span class="math-unit">kg</span> <span class="math-operator">=</span> $4 <span class="math-unit">tonnes</span>');
  }
  
  // Process the expression with the standard replacements
  let processedExpression = expression
    // Spaces
    .replace(/\\,/g, '<span class="math-thin-space"></span>')
    .replace(/\\:/g, '<span class="math-medium-space"></span>')
    .replace(/\\;/g, '<span class="math-thick-space"></span>')
    .replace(/~/g, '<span class="math-nbsp">&nbsp;</span>')
    
    // Greek letters
    .replace(/\\alpha/g, '&alpha;')
    .replace(/\\beta/g, '&beta;')
    .replace(/\\gamma/g, '&gamma;')
    .replace(/\\delta/g, '&delta;')
    .replace(/\\epsilon/g, '&epsilon;')
    .replace(/\\zeta/g, '&zeta;')
    .replace(/\\eta/g, '&eta;')
    .replace(/\\theta/g, '&theta;')
    .replace(/\\iota/g, '&iota;')
    .replace(/\\kappa/g, '&kappa;')
    .replace(/\\lambda/g, '&lambda;')
    .replace(/\\mu/g, '&mu;')
    .replace(/\\nu/g, '&nu;')
    .replace(/\\xi/g, '&xi;')
    .replace(/\\pi/g, '&pi;')
    .replace(/\\rho/g, '&rho;')
    .replace(/\\sigma/g, '&sigma;')
    .replace(/\\tau/g, '&tau;')
    .replace(/\\upsilon/g, '&upsilon;')
    .replace(/\\phi/g, '&phi;')
    .replace(/\\chi/g, '&chi;')
    .replace(/\\psi/g, '&psi;')
    .replace(/\\omega/g, '&omega;')
    
    // Capital Greek letters
    .replace(/\\Gamma/g, '&Gamma;')
    .replace(/\\Delta/g, '&Delta;')
    .replace(/\\Theta/g, '&Theta;')
    .replace(/\\Lambda/g, '&Lambda;')
    .replace(/\\Xi/g, '&Xi;')
    .replace(/\\Pi/g, '&Pi;')
    .replace(/\\Sigma/g, '&Sigma;')
    .replace(/\\Upsilon/g, '&Upsilon;')
    .replace(/\\Phi/g, '&Phi;')
    .replace(/\\Psi/g, '&Psi;')
    .replace(/\\Omega/g, '&Omega;')
    
    // Math operators
    .replace(/\\times/g, '<span class="math-operator">&times;</span>')
    .replace(/\\div/g, '<span class="math-operator">&divide;</span>')
    .replace(/\\pm/g, '<span class="math-operator">&plusmn;</span>')
    .replace(/\\mp/g, '<span class="math-operator">&#8723;</span>')
    .replace(/\\cdot/g, '<span class="math-operator">&middot;</span>')
    .replace(/\\leq/g, '<span class="math-operator">&le;</span>')
    .replace(/\\geq/g, '<span class="math-operator">&ge;</span>')
    .replace(/\\neq/g, '<span class="math-operator">&ne;</span>')
    .replace(/\\approx/g, '<span class="math-operator">&asymp;</span>')
    .replace(/\\equiv/g, '<span class="math-operator">&equiv;</span>')
    .replace(/\\sum/g, '<span class="math-operator">&sum;</span>')
    .replace(/\\prod/g, '<span class="math-operator">&prod;</span>')
    .replace(/\\int/g, '<span class="math-operator">&int;</span>')
    .replace(/\\infty/g, '<span class="math-operator">&infin;</span>')
    .replace(/\\partial/g, '<span class="math-operator">&part;</span>')
    .replace(/\\nabla/g, '<span class="math-operator">&nabla;</span>')
    .replace(/\\forall/g, '<span class="math-operator">&forall;</span>')
    .replace(/\\exists/g, '<span class="math-operator">&exist;</span>')
    .replace(/\\in/g, '<span class="math-operator">&isin;</span>')
    .replace(/\\notin/g, '<span class="math-operator">&notin;</span>')
    .replace(/\\subset/g, '<span class="math-operator">&sub;</span>')
    .replace(/\\supset/g, '<span class="math-operator">&sup;</span>')
    .replace(/\\cup/g, '<span class="math-operator">&cup;</span>')
    .replace(/\\cap/g, '<span class="math-operator">&cap;</span>')
    .replace(/\\emptyset/g, '<span class="math-operator">&empty;</span>')
    .replace(/\\therefore/g, '<span class="math-operator">&there4;</span>')
    .replace(/\\because/g, '<span class="math-operator">&#8757;</span>')
    .replace(/\\implies/g, '<span class="math-operator">&rArr;</span>')
    .replace(/\\iff/g, '<span class="math-operator">&hArr;</span>')
    .replace(/\\to/g, '<span class="math-operator">&rarr;</span>')
    .replace(/\\gets/g, '<span class="math-operator">&larr;</span>')
    .replace(/\\uparrow/g, '<span class="math-operator">&uarr;</span>')
    .replace(/\\downarrow/g, '<span class="math-operator">&darr;</span>')
    .replace(/\\leftrightarrow/g, '<span class="math-operator">&harr;</span>')
    .replace(/\\Rightarrow/g, '<span class="math-operator">&rArr;</span>')
    .replace(/\\Leftarrow/g, '<span class="math-operator">&lArr;</span>')
    .replace(/\\Leftrightarrow/g, '<span class="math-operator">&hArr;</span>')
    
    // Common operators with proper spacing
    .replace(/([^<])\s*=\s*([^>])/g, '$1 <span class="math-operator">=</span> $2')
    .replace(/([^<])\s*\+\s*([^>])/g, '$1 <span class="math-operator">+</span> $2')
    .replace(/([^<])\s*-\s*([^>])/g, '$1 <span class="math-operator">-</span> $2')
    .replace(/([^<])\s*\*\s*([^>])/g, '$1 <span class="math-operator">&times;</span> $2')
    .replace(/([^<])\s*\/\s*([^>])/g, '$1 <span class="math-operator">&divide;</span> $2')
    
    // Fractions
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="math-frac"><span class="math-num">$1</span><span class="math-denom">$2</span></span>')
    
    // Superscripts and subscripts
    .replace(/\^(\{[^{}]*\}|[^{}\s])/g, function(match, p1) {
      // Remove braces if present
      const content = p1.startsWith('{') ? p1.slice(1, -1) : p1;
      return `<sup>${content}</sup>`;
    })
    .replace(/_(\{[^{}]*\}|[^{}\s])/g, function(match, p1) {
      // Remove braces if present
      const content = p1.startsWith('{') ? p1.slice(1, -1) : p1;
      return `<sub>${content}</sub>`;
    })
    
    // Square roots
    .replace(/\\sqrt\{([^{}]*)\}/g, '&radic;<span class="math-sqrt">$1</span>')
    .replace(/\\sqrt\[([^[\]]*)\]\{([^{}]*)\}/g, '<sup>$1</sup>&radic;<span class="math-sqrt">$2</span>')
    
    // Text within math - handle common units specifically
    .replace(/\\text\{(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\}/g, '<span class="math-unit">$1</span>')
    .replace(/\\text\{([^{}]*)\}/g, '<span class="math-text">$1</span>')
    .replace(/\\textbf\{([^{}]*)\}/g, '<span class="math-text"><strong>$1</strong></span>')
    .replace(/\\textit\{([^{}]*)\}/g, '<span class="math-text"><em>$1</em></span>')
    
    // Handle common units
    .replace(/\\mathrm\{(kg|g|mg|km|m|cm|mm|s|min|h|L|mL|mol|K|°C|°F|N|Pa|J|W|V|A|Ω|Hz|tonne|ton|tonnes|tons)\}/g, '<span class="math-unit">$1</span>')
    .replace(/\\mathrm\{([^{}]*)\}/g, '<span class="math-rm">$1</span>')
    
    // Common LaTeX environments
    .replace(/\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}/g, function(match, content) {
      // Replace \\ with line breaks and & with column separators
      return '<div class="math-matrix">' + 
        content.replace(/\\\\/g, '<br>').replace(/&/g, '<span class="math-matrix-col"></span>') + 
        '</div>';
    })
    
    // Replace newlines with breaks
    .replace(/\n/g, '<br>');
    
  // Final check for the specific pattern in the screenshot
  if (processedExpression.includes('kg') && processedExpression.includes('×') && processedExpression.includes('=') && (processedExpression.includes('tonne') || processedExpression.includes('tonnes'))) {
    // Try to extract the numbers and format it properly
    const match = processedExpression.match(/(\d+).*?kg.*?×.*?(\d+).*?=.*?(\d+).*?kg.*?=.*?(\d+).*?(tonne|tonnes)/);
    if (match) {
      const [_, num1, multiplier, result1, result2, unit3] = match;
      return `${num1} <span class="math-unit">kg</span> <span class="math-operator">&times;</span> ${multiplier} <span class="math-operator">=</span> ${result1} <span class="math-unit">kg</span> <span class="math-operator">=</span> ${result2} <span class="math-unit">${unit3}</span>`;
    }
  }
  
  return processedExpression;
}

// Simple syntax highlighting function
function highlightSyntax(code, language) {
  // Skip if no language is specified
  if (!language) return code;
  
  try {
    // Create a safe working copy
    let safeCode = code;
    
    // Language-specific patterns
    const patterns = {
      python: {
        keywords: /\b(def|class|if|elif|else|for|while|import|from|as|try|except|finally|with|return|yield|raise|break|continue|pass|assert|lambda|None|True|False)\b/g,
        comments: /(#[^\n]*)/g,
        strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"""[\s\S]*?"""|'''[\s\S]*?''')/g,
        numbers: /\b(\d+(\.\d+)?)\b/g,
        decorators: /(@[\w\.]+)/g
      },
      javascript: {
        keywords: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|super|extends|static|get|set)\b/g,
        comments: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
        strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
        numbers: /\b(\d+(\.\d+)?)\b/g
      },
      java: {
        keywords: /\b(public|private|protected|class|interface|enum|extends|implements|static|final|void|abstract|new|if|else|for|while|do|switch|case|break|continue|return|try|catch|finally|throw|throws|import|package)\b/g,
        comments: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
        strings: /("(?:[^"\\]|\\.)*")/g,
        numbers: /\b(\d+(\.\d+)?[fLd]?)\b/g
      },
      bash: {
        keywords: /\b(if|then|else|elif|fi|case|esac|for|while|until|do|done|in|function|select|time|coproc)\b/g,
        comments: /(#[^\n]*)/g,
        strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
        variables: /(\$\w+|\$\{[^}]*\})/g
      }
    };
    
    // Normalize language
    const lang = language.toLowerCase();
    let pattern;
    
    // Select the appropriate pattern
    if (lang === 'python' || lang === 'py') {
      pattern = patterns.python;
    } else if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
      pattern = patterns.javascript;
    } else if (lang === 'java') {
      pattern = patterns.java;
    } else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
      pattern = patterns.bash;
    } else {
      // No specific highlighting for this language
      return safeCode;
    }
    
    // Create a temporary array to store tokens
    const tokens = [];
    
    // Tokenize the code by replacing patterns with placeholders
    // This prevents nested replacements
    
    // First, handle comments
    if (pattern.comments) {
      safeCode = safeCode.replace(pattern.comments, function(match) {
        tokens.push({ type: 'comment', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Then strings
    if (pattern.strings) {
      safeCode = safeCode.replace(pattern.strings, function(match) {
        tokens.push({ type: 'string', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Then keywords
    if (pattern.keywords) {
      safeCode = safeCode.replace(pattern.keywords, function(match) {
        tokens.push({ type: 'keyword', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Then numbers
    if (pattern.numbers) {
      safeCode = safeCode.replace(pattern.numbers, function(match) {
        tokens.push({ type: 'number', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Then decorators
    if (pattern.decorators) {
      safeCode = safeCode.replace(pattern.decorators, function(match) {
        tokens.push({ type: 'decorator', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Then variables
    if (pattern.variables) {
      safeCode = safeCode.replace(pattern.variables, function(match) {
        tokens.push({ type: 'variable', content: match });
        return `__TOKEN_${tokens.length - 1}__`;
      });
    }
    
    // Restore tokens with HTML spans
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const placeholder = `__TOKEN_${i}__`;
      const spanClass = `hljs-${token.type}`;
      const spanContent = token.content;
      safeCode = safeCode.replace(placeholder, `<span class="${spanClass}">${spanContent}</span>`);
    }
    
    return safeCode;
  } catch (error) {
    console.error('Error in syntax highlighting:', error);
    return code; // Return original code if there's an error
  }
}

// Function to determine the appropriate language class
function getLanguageClass(language) {
  // Normalize the language name
  const lang = language.toLowerCase().trim();
  
  // Map of common language aliases
  const languageMap = {
    'js': 'language-javascript',
    'javascript': 'language-javascript',
    'ts': 'language-typescript',
    'typescript': 'language-typescript',
    'py': 'language-python',
    'python': 'language-python',
    'java': 'language-java',
    'c': 'language-c',
    'cpp': 'language-cpp',
    'c++': 'language-cpp',
    'cs': 'language-csharp',
    'csharp': 'language-csharp',
    'go': 'language-go',
    'golang': 'language-go',
    'rb': 'language-ruby',
    'ruby': 'language-ruby',
    'php': 'language-php',
    'html': 'language-html',
    'css': 'language-css',
    'xml': 'language-xml',
    'json': 'language-json',
    'yaml': 'language-yaml',
    'yml': 'language-yaml',
    'md': 'language-markdown',
    'markdown': 'language-markdown',
    'bash': 'language-bash',
    'sh': 'language-bash',
    'shell': 'language-bash',
    'sql': 'language-sql',
    'rust': 'language-rust',
    'swift': 'language-swift',
    'kotlin': 'language-kotlin',
    'dart': 'language-dart',
    'r': 'language-r'
  };
  
  // Return the mapped language class or a default if not found
  return languageMap[lang] || 'language-plaintext';
}

// Function to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Function to unescape HTML (used for syntax highlighting)
function unescapeHtml(html) {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'");
}

// Function to copy code to clipboard
window.copyToClipboard = function(codeElement) {
  const textToCopy = codeElement.textContent;
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    const button = codeElement.closest('.code-block-wrapper').querySelector('.copy-button');
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
};

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
  
  // Scroll to the bottom of the chat
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
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
  conversation.messages.forEach(message => {
    addMessage(message.text, message.isUser);
  });
  
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
  addMessage('Hello! How can I help you today?', false);
  
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
}); 