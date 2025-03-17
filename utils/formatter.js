/**
 * Simplified text formatter using markdown-it and KaTeX
 */
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const katex = require('katex');

// Create markdown-it instance with options
const md = new MarkdownIt({
  html: true,         // Enable HTML tags
  linkify: true,      // Autoconvert URLs to links
  typographer: true,  // Enable smart quotes and other typographic replacements
  breaks: true,       // Convert \n in paragraphs into <br>
  highlight: function(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const highlighted = hljs.highlight(str, { language: lang }).value;
        return '<pre class="hljs"><code class="language-' + 
               lang + '">' +
               highlighted +
               '</code></pre>';
      } catch (__) {
        // Fallback to auto-detection if specified language highlight fails
        try {
          const highlighted = hljs.highlightAuto(str).value;
          return '<pre class="hljs"><code>' +
                 highlighted +
                 '</code></pre>';
        } catch (___) {
          return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
        }
      }
    }
    
    // For code blocks without a language tag, try to auto-detect
    try {
      const highlighted = hljs.highlightAuto(str).value;
      return '<pre class="hljs"><code>' +
             highlighted +
             '</code></pre>';
    } catch (e) {
      return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
  }
});

// Fix rendering issues with lists
md.renderer.rules.list_item_open = function (tokens, idx) {
  return '<li class="markdown-list-item">';
};

md.renderer.rules.bullet_list_open = function (tokens, idx) {
  return '<ul class="markdown-list">';
};

md.renderer.rules.ordered_list_open = function (tokens, idx) {
  return '<ol class="markdown-list">';
};

/**
 * Main format function - converts text with markdown and math to HTML
 * @param {string} text - The input text to format
 * @returns {string} - Formatted HTML
 */
function formatText(text) {
  try {
    // Pre-process the text to fix common formatting issues with lists
    let processedText = preprocessListItems(text);
    
    // Step 1: Pre-process math expressions before markdown rendering
    processedText = preprocessMath(processedText);
    
    // Step 2: Convert markdown to HTML (math expressions are protected)
    let html = md.render(processedText);
    
    // Step 3: Post-process to restore and render math expressions
    html = renderMathExpressions(html);
    
    // Step 4: Format citation references like [1], [2], etc.
    html = formatCitationReferences(html);
    
    // Step 5: Add copy buttons to code blocks
    const htmlWithCopyButtons = addCopyButtonsToCodeBlocks(html);
    
    return htmlWithCopyButtons;
  } catch (error) {
    console.error('Error formatting text:', error);
    return `<div class="error">${escapeHtml(text)}</div>`;
  }
}

// Math placeholder pattern that won't be touched by markdown renderer
const MATH_PLACEHOLDER_PATTERN = 'MATH_EXPRESSION_PLACEHOLDER_';
const mathExpressions = [];

/**
 * Preprocess text to temporarily replace math expressions with placeholders
 * @param {string} text - Original text with potential math expressions
 * @returns {string} - Text with math expressions replaced by placeholders
 */
function preprocessMath(text) {
  // Reset the math expressions array
  mathExpressions.length = 0;
  
  // Helper function to store a math expression and return a placeholder
  const storeMathExpression = (formula, isDisplay) => {
    const id = mathExpressions.length;
    mathExpressions.push({ formula, isDisplay });
    return `${MATH_PLACEHOLDER_PATTERN}${id}`;
  };
  
  let processedText = text;
  
  // 1. First, handle standalone bracket-enclosed formulas (the specific case from the user)
  processedText = processedText.replace(/\[\s*\n\s*([\s\S]*?)\n\s*\]/g, (match, content) => {
    if (isMathExpression(content.trim())) {
      return storeMathExpression(content.trim(), true);
    }
    return match;
  });
  
  // 2. Handle displayed math with dollar signs: $$...$$
  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    return storeMathExpression(formula.trim(), true);
  });
  
  // 3. Handle inline math with dollar signs: $...$
  processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    return storeMathExpression(formula.trim(), false);
  });
  
  // 4. Handle standalone LaTeX expressions that look like math
  processedText = processedText.replace(/(\n\s*)(\\frac|\\sum|\\int|\\prod|\\lim)([\s\S]*?)(\n\s*)/g, 
    (match, before, command, rest, after) => {
      return before + storeMathExpression(command + rest.trim(), true) + after;
    }
  );
  
  // 5. Handle LaTeX equations with \begin{equation}...\end{equation}
  processedText = processedText.replace(/\\begin\{(equation|align|gather|eqnarray)\}([\s\S]*?)\\end\{\1\}/g, 
    (match, envType, formula) => {
      return storeMathExpression(formula.trim(), true);
    }
  );
  
  // 6. Handle inline LaTeX with \(...\)
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
    return storeMathExpression(formula.trim(), false);
  });
  
  // 7. Handle other bracketed math expressions with recognizable commands
  processedText = processedText.replace(/\[\s*(\\frac|\\sum|\\int|\\prod|\\lim|\\inf|\\sup|\\pi)([\s\S]*?)\]/g, 
    (match, command, rest) => {
      return storeMathExpression(command + rest.trim(), true);
    }
  );

  // ===== BRACKET CLEANUP SECTION =====
  // Now clean up any math placeholders that might still be surrounded by brackets
  
  // 8. Remove brackets from math placeholders on the same line
  processedText = processedText.replace(/\[\s*(MATH_EXPRESSION_PLACEHOLDER_\d+)\s*\]/g, '$1');
  processedText = processedText.replace(/\\\[\s*(MATH_EXPRESSION_PLACEHOLDER_\d+)\s*\\\]/g, '$1');
  
  // 9. Handle multiline brackets - LaTeX style \[ \] brackets
  processedText = processedText.replace(/(\n\s*)\\\[\s*(\n\s*)(MATH_EXPRESSION_PLACEHOLDER_\d+)(\n\s*)\\\](\s*\n|$)/g, 
    '$1$3$5'
  );
  
  // 10. Handle multiline brackets - Plain square brackets
  processedText = processedText.replace(/(\n\s*)\[\s*(\n\s*)(MATH_EXPRESSION_PLACEHOLDER_\d+)(\n\s*)\](\s*\n|$)/g, 
    '$1$3$5'
  );
  
  // 11. Handle more complex patterns with potential whitespace and newlines
  // Pattern: bracket at beginning of line, placeholder, bracket at end
  processedText = processedText.replace(/^(\s*)\[\s*\n*(MATH_EXPRESSION_PLACEHOLDER_\d+)\n*\s*\](\s*)$/gm, 
    '$1$2$3'
  );
  
  // Pattern: bracket at end of line, placeholder, bracket at beginning
  processedText = processedText.replace(/(\n\s*)\[\s*$\n(MATH_EXPRESSION_PLACEHOLDER_\d+)\n^\s*\](\s*\n|$)/gm, 
    '$1$2$3'
  );

  // 12. Special case for brackets that might be before or after the placeholder
  // Opening bracket before placeholder
  processedText = processedText.replace(/\\?\[\s*\n?\s*(MATH_EXPRESSION_PLACEHOLDER_\d+)/g, '$1');
  
  // Closing bracket after placeholder
  processedText = processedText.replace(/(MATH_EXPRESSION_PLACEHOLDER_\d+)\s*\n?\s*\\?\]/g, '$1');
  
  // 13. Extra aggressive pattern for any bracket directly touching a placeholder
  processedText = processedText.replace(/\\\[(MATH_EXPRESSION_PLACEHOLDER_\d+)\\\]/g, '$1');
  processedText = processedText.replace(/\[(MATH_EXPRESSION_PLACEHOLDER_\d+)\]/g, '$1');
  
  // Finally, check for any remaining brackets on lines adjacent to placeholders
  const lines = processedText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(MATH_PLACEHOLDER_PATTERN)) {
      // Check line above for standalone closing bracket
      if (i > 0 && /^\s*\\?\]\s*$/.test(lines[i-1])) {
        lines[i-1] = '';
      }
      
      // Check line below for standalone opening bracket
      if (i < lines.length - 1 && /^\s*\\?\[\s*$/.test(lines[i+1])) {
        lines[i+1] = '';
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Render all math expressions after markdown processing
 * @param {string} html - HTML with math placeholders
 * @returns {string} - HTML with rendered math
 */
function renderMathExpressions(html) {
  // Replace each placeholder with its rendered math expression
  return html.replace(new RegExp(`${MATH_PLACEHOLDER_PATTERN}(\\d+)`, 'g'), (match, id) => {
    const mathObj = mathExpressions[parseInt(id, 10)];
    if (!mathObj) return match;
    
    return renderFormula(mathObj.formula, mathObj.isDisplay);
  });
}

/**
 * Render a single formula using KaTeX
 * @param {string} formula - The LaTeX formula to render
 * @param {boolean} isDisplay - Whether to use display mode or inline mode
 * @returns {string} - Rendered HTML
 */
function renderFormula(formula, isDisplay) {
  try {
    // Clean up formula - handle newlines and brackets
    let cleanFormula = formula;
    
    // Join lines if the formula has newlines
    if (cleanFormula.includes('\n')) {
      cleanFormula = cleanFormula.split('\n').map(line => line.trim()).join(' ');
    }
    
    // Remove brackets that might be surrounding the formula
    cleanFormula = cleanFormula.replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '');
    
    // Special case for E=MC^2 and similar physics formulas
    if (cleanFormula.match(/^[A-Z]\s*=\s*[A-Z][A-Z0-9]*(?:\^[0-9])?$/)) {
      cleanFormula = cleanFormula.replace(/([A-Z])\s*=\s*([A-Z])([A-Z0-9]*)(\^?)([0-9]?)/, '$1 = $2$3$4$5');
    }
    
    // Handle Leibniz series and ensure it has proper structure
    if (cleanFormula.includes('\\sum') && cleanFormula.includes('\\frac')) {
      // Ensure summation has limits if they're missing
      if (!cleanFormula.includes('\\sum_')) {
        cleanFormula = cleanFormula.replace(/\\sum/, '\\sum_{k=0}^{\\infty}');
      }
    }
    
    // Fix common issues in formulas
    cleanFormula = cleanFormula
      .replace(/,=,/g, '=')  // Fix equals signs with commas
      .replace(/\\,=\\,/g, '=')  // Remove problematic spacing around equals
      .replace(/\\,\\times\\,/g, '\\times');  // Fix spacing around times symbol
    
    // Render with KaTeX
    const rendered = katex.renderToString(cleanFormula, {
      displayMode: isDisplay,
      throwOnError: false,
      output: 'html',
      trust: true,
      macros: {
        "\\unit": "\\,\\textrm{#1}",
        "\\vs": "\\textsf{VS Code}",
        "\\cursor": "\\textsf{Cursor}"
      },
      colorIsTextColor: true // Better for dark themes
    });
    
    // Wrap in appropriate container
    if (isDisplay) {
      return `<div class="math-block">${rendered}</div>`;
    } else {
      return `<span class="math-inline">${rendered}</span>`;
    }
  } catch (error) {
    console.error('Error rendering formula:', error, formula);
    
    // Fallback to plain text if rendering fails
    if (isDisplay) {
      return `<div class="math-block">${escapeHtml(formula)}</div>`;
    } else {
      return `<span class="math-inline">${escapeHtml(formula)}</span>`;
    }
  }
}

/**
 * Check if a string contains LaTeX mathematical expressions
 * @param {string} text - The text to check
 * @returns {boolean} - Whether the text contains LaTeX math
 */
function isMathExpression(text) {
  // Common LaTeX math commands and symbols
  const mathPatterns = [
    /\\frac/, /\\sum/, /\\int/, /\\prod/, /\\lim/, /\\inf/, /\\sup/,
    /\\alpha/, /\\beta/, /\\gamma/, /\\delta/, /\\epsilon/, /\\zeta/, /\\eta/, /\\theta/,
    /\\iota/, /\\kappa/, /\\lambda/, /\\mu/, /\\nu/, /\\xi/, /\\pi/, /\\rho/,
    /\\sigma/, /\\tau/, /\\upsilon/, /\\phi/, /\\chi/, /\\psi/, /\\omega/,
    /\\partial/, /\\nabla/, /\\approx/, /\\sim/, /\\cong/, /\\equiv/,
    /\\times/, /\\div/, /\\pm/, /\\mp/, /\\cup/, /\\cap/, /\\in/, /\\ni/,
    /\\subset/, /\\supset/, /\\emptyset/, /\\forall/, /\\exists/, /\\neg/,
    /\\rightarrow/, /\\leftarrow/, /\\Rightarrow/, /\\Leftarrow/, /\\infty/,
    /\\sin/, /\\cos/, /\\tan/, /\\cot/, /\\sec/, /\\csc/, /\\log/, /\\ln/,
    /\{/, /\}/, /\^/, /\_/, /\\left/, /\\right/, /\\cdot/, /\\cdots/, /\\ldots/
  ];
  
  // Special cases that we definitely want to treat as math
  if (text.includes('\\sum') && text.includes('\\frac')) return true;
  if (text.includes('\\pi') || text.includes('\\infty')) return true;
  
  // Check for common math patterns
  if (mathPatterns.some(pattern => pattern.test(text))) return true;
  
  // Check for fractions, subscripts, and superscripts
  return /\d\/\d/.test(text) || 
         /[_^]\{\w+\}/.test(text) || 
         /[_^]\w/.test(text) ||
         /\((-|\+)?\d+\)/.test(text);
}

/**
 * Add copy buttons to code blocks
 * @param {string} html - The HTML with code blocks
 * @returns {string} - The HTML with copy buttons added to code blocks
 */
function addCopyButtonsToCodeBlocks(html) {
  return html.replace(/<pre class="hljs"><code/g, 
    '<div class="code-block-wrapper"><button class="copy-button" onclick="copyToClipboard(this.nextElementSibling.querySelector(\'code\'))">Copy</button><pre class="hljs"><code')
    .replace(/<\/code><\/pre>/g, '</code></pre></div>');
}

/**
 * Escape HTML special characters
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format citation references like [1], [2], etc. in the HTML
 * @param {string} html - HTML with potential citation references
 * @returns {string} - HTML with formatted citation references
 */
function formatCitationReferences(html) {
  // Regular expression to match citation references [n] that aren't part of URLs or other constructs
  // Negative lookbehind to avoid matching within URLs or complex constructs
  return html.replace(/(?<!\])\[(\d+)\](?!\()/g, '<sup class="citation-reference">[$1]</sup>');
}

/**
 * Pre-process list items to fix formatting issues
 * @param {string} text - The text to process
 * @returns {string} - Processed text with fixed list formatting
 */
function preprocessListItems(text) {
  // Fix bullet points with improper spacing and formatting
  // This targets lists where the bullet and the bold text might be causing alignment issues
  
  // First handle bulleted lists with bold text at the beginning of an item
  let processed = text.replace(/^(\s*[-*+]\s+)(\*\*[^*]+\*\*)(.*)$/gm, '$1$2$3');
  
  // Then handle numbered lists with bold text at the beginning of an item
  processed = processed.replace(/^(\s*\d+\.\s+)(\*\*[^*]+\*\*)(.*)$/gm, '$1$2$3');
  
  // Ensure consistent spacing after list markers
  processed = processed.replace(/^(\s*[-*+])(\S)/gm, '$1 $2');
  processed = processed.replace(/^(\s*\d+\.)(\S)/gm, '$1 $2');
  
  return processed;
}

module.exports = {
  formatText
}; 