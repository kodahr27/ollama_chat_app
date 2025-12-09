import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  Send,
  Check,
  Copy,
  Trash2,
  User,
  Bot,
  Sun,
  Moon,
  Square,
  Menu,
  Settings,
  History,
  Plus,
  Download,
  Upload,
  ChevronDown,
  X,
  Image as ImageIcon,
  FileText,
  Folder,
  Edit,
  Save,
  ChevronRight,
  Search,
  FileCode,
  FolderOpen,
  Eye,
  EyeOff,
  Play,
  SquareStack,
  ChevronLeft,
  HardDrive,
  Archive,
  Shield,
  Clock,
  RotateCcw,
  Code2,
  FolderPlus,
  FilePlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import "./App.css";

// 🎯 CONSTANTS & CONFIGURATION
const APP_CONFIG = Object.freeze({
  OLLAMA_BASE: import.meta.env.VITE_OLLAMA_URL || "http://127.0.0.1:11434",
  TIMEOUTS: {
    COPY_FEEDBACK: 1800,
    AUTO_SCROLL_PADDING: 100,
    RETRY_DELAY: 1000,
    DEBOUNCE_DELAY: 300,
  },
  LIMITS: {
    MAX_INPUT_LENGTH: 400000,
    MAX_MESSAGES: 1000,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,
    MAX_ARTIFACTS_PER_MESSAGE: 50,
    MAX_EDIT_LINES: 1000,
    MAX_STORAGE_BYTES: 5 * 1024 * 1024,
  },
  PARSING: {
    REGEX_PATTERNS: {
      CODE_WITH_FILENAME: /```(\w+)?\s*\n\/\/\s*filename:\s*([^\n]+)\n([\s\S]*?)```/gi,
      EDIT_BLOCK: /```(?:edit)?\s*\n([\s\S]*?)```/gi,
      SEARCH_REPLACE: /<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/gi,
      FILE_MARKER: /@@@ (.+)/,
    }
  },
  STORAGE_KEYS: {
    CONVERSATIONS: 'ollama-conversations',
    ARTIFACTS: 'ollama-artifacts',
    SETTINGS: 'ollama-settings',
    SHOW_ARTIFACTS: 'ollama-show-artifacts'
  }
});

// 🎯 UTILITY FUNCTIONS
const generateSafeId = (base = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 12);
  const performanceMark = performance.now().toString(36).replace('.', '');
  return `${base}-${timestamp}-${performanceMark}-${random}`;
};

const validateAndSanitizePath = (path) => {
  if (!path || typeof path !== 'string') return 'unknown.txt';
  let sanitized = path.replace(/\.\./g, '').replace(/\\/g, '/').trim();
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  if (!sanitized.includes('.') && !sanitized.endsWith('/')) {
    sanitized += '.txt';
  }
  return sanitized;
};

const getLanguageFromPath = (path) => {
  const safePath = validateAndSanitizePath(path);
  const ext = safePath.split('.').pop()?.toLowerCase();
  const languageMap = {
    'js': 'javascript', 'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx',
    'css': 'css', 'html': 'html', 'json': 'json', 'md': 'markdown',
    'py': 'python', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'php': 'php', 'rb': 'ruby', 'go': 'go', 'rs': 'rust',
    'txt': 'text', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
    'sh': 'bash', 'bash': 'bash', 'sql': 'sql', 'vue': 'vue', 
    'svelte': 'svelte', 'swift': 'swift', 'kt': 'kotlin',
    'scala': 'scala', 'r': 'r', 'pl': 'perl', 'lua': 'lua'
  };
  return languageMap[ext] || 'text';
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (date) => {
  return new Date(date).toLocaleString();
};

// 🎯 ADD DEDUPLICATION HELPER
const deduplicateArtifacts = (artifacts) => {
  const seen = new Set();
  return artifacts.filter(artifact => {
    const key = artifact.path;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

// Add this function after your other utility functions
const fixCorruptedArtifacts = (artifactsData) => {
  if (!artifactsData || typeof artifactsData !== 'object') {
    console.log("🔄 [FIX] No artifacts data to fix");
    return {};
  }
  
  const fixed = {};
  
  Object.keys(artifactsData).forEach(conversationId => {
    const artifacts = artifactsData[conversationId];
    
    if (Array.isArray(artifacts)) {
      // Filter out invalid artifacts and ensure they have required fields
      const validArtifacts = artifacts.filter(artifact => 
        artifact && 
        typeof artifact === 'object' && 
        artifact.path && 
        artifact.content !== undefined
      ).map(artifact => ({
        ...artifact,
        id: artifact.id || generateSafeId(`file-${artifact.path}`),
        type: artifact.type || 'file',
        createdBy: artifact.createdBy || 'unknown',
        timestamp: artifact.timestamp || new Date().toISOString(),
        language: artifact.language || getLanguageFromPath(artifact.path)
      }));
      
      fixed[conversationId] = validArtifacts;
      console.log(`🔄 [FIX] Fixed ${validArtifacts.length} artifacts for conversation ${conversationId}`);
    } else {
      console.log(`🔄 [FIX] Invalid artifacts for conversation ${conversationId}, resetting to empty array`);
      fixed[conversationId] = [];
    }
  });
  
  return fixed;
};

const ENHANCED_SYSTEM_PROMPT = `You are an advanced AI coding assistant with intelligent file editing capabilities.

## FILE CREATION FORMAT:

### TO CREATE NEW FILES, use this EXACT format:
\`\`\`javascript
// filename: src/components/Button.jsx
export function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}
\`\`\`

### ALTERNATIVE FORMATS (also work):
\`\`\`
File: utils/helpers.py
def helper_function():
    return "Hello"
\`\`\`

\`\`\`python
# filename: main.py
print("Hello World")
\`\`\`

### KEY RULES:
1. Place filename comment as the FIRST LINE inside code block
2. Use // for JavaScript/TypeScript, # for Python/Ruby, <!-- for HTML
3. Include full path if needed: src/utils/config.js

## FILE EDITING SYSTEM (Claude.ai Style):

### CRITICAL WORKFLOW:
1. 🚨 ALWAYS read the EXISTING PROJECT FILES first (provided below)
2. Understand the exact file structure and content
3. Only then create SEARCH/REPLACE blocks

### CREATING NEW FILES:
Use standard code blocks with a filename comment:
\`\`\`javascript
// filename: src/components/Button.jsx
export function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}
\`\`\`

### EDITING EXISTING FILES:
1. First locate the file in "EXISTING PROJECT FILES"
2. Find the exact lines you want to change
3. Copy them EXACTLY (character-for-character) into SEARCH
4. Create the REPLACE block

### FORMAT FOR SINGLE-LINE CHANGES:
\`\`\`edit
@@@ filename.py
<<<<<<< SEARCH
print("Hello")
=======
print("Goodbye")
>>>>>>> REPLACE
\`\`\`

### FORMAT FOR MULTI-LINE CHANGES:
\`\`\`edit
@@@ filename.js
<<<<<<< SEARCH
function oldFunction() {
  console.log("old");
  return 42;
}
=======
function newFunction() {
  console.log("new");
  return 100;
}
>>>>>>> REPLACE
\`\`\`

### ABSOLUTE RULES:
1. ⚠️ SEARCH blocks MUST be copied DIRECTLY from the files shown below
2. ⚠️ Include ALL whitespace, indentation, and newlines exactly as shown
3. ⚠️ If unsure, ask the user to show you the specific section
4. ⚠️ Never invent or guess file content - only use what's provided
5. For complex changes, provide multiple SEARCH/REPLACE blocks`;

const DEFAULT_SYSTEM_PROMPT = ENHANCED_SYSTEM_PROMPT;

// 🎯 CUSTOM HOOKS
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
};

const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("ollama-theme");
    return saved === "dark" || saved === "light" ? saved : "light";
  });

  const applyTheme = useCallback((newTheme) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", newTheme);
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setThemeWithSave = useCallback((newTheme) => {
    if (newTheme === "dark" || newTheme === "light") {
      setTheme(newTheme);
      localStorage.setItem("ollama-theme", newTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeWithSave(theme === "light" ? "dark" : "light");
  }, [theme, setThemeWithSave]);

  return {
    theme,
    setTheme: setThemeWithSave,
    toggleTheme,
    isDark: theme === "dark",
    isLight: theme === "light",
  };
};

// 🎯 COMPONENTS
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div className="error-icon"><Square className="icon-large" /></div>
          <h2 className="error-title">Something went wrong</h2>
          <p className="error-message">An unexpected error occurred. Please refresh the page.</p>
          <button className="retry-button" onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Avatar = React.memo(({ role }) => {
  const isUser = role === "user";
  return (
    <div className={`avatar ${isUser ? "avatar-user" : "avatar-assistant"}`}>
      {isUser ? <User className="avatar-icon" /> : <Bot className="avatar-icon" />}
    </div>
  );
});

const ClickOutside = React.memo(({ onClickOutside, children, active = true }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || !onClickOutside) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClickOutside(e);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [active, onClickOutside]);

  return <div ref={ref}>{children}</div>;
});

const LoadingSkeleton = React.memo(() => (
  <div className="loading-skeleton">
    <div className="skeleton-avatar"></div>
    <div className="skeleton-content">
      <div className="skeleton-line"></div>
      <div className="skeleton-line short"></div>
    </div>
  </div>
));

const ThemeToggle = React.memo(() => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Theme: ${theme}`}
      aria-label={`Toggle theme, current: ${theme}`}
    >
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
});

// 🎯 MAIN APP COMPONENT
export default function App() {
  // Performance optimization
  const renderCount = useRef(0);
  renderCount.current++;
  
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const [models, setModels] = useState({ cloud: [], nonCloud: [] });
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [ollamaError, setOllamaError] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showUnrecommended, setShowUnrecommended] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isOnline] = useState(navigator.onLine);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [artifacts, setArtifacts] = useState({});
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewingEdit, setViewingEdit] = useState(null);
  const [showStorageManagement, setShowStorageManagement] = useState(false);
  const [currentEdits, setCurrentEdits] = useState([]);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showEmptyState, setShowEmptyState] = useState(true);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const loadTimerRef = useRef(null);
  const createMenuRef = useRef(null);
  const folderInputRef = useRef(null);

  // 🎯 DERIVED STATE
  const currentArtifacts = useMemo(() => {
    return artifacts[currentConversationId] || [];
  }, [artifacts, currentConversationId]);

  // 🎯 PARSE SEARCH/REPLACE - MUST BE DEFINED BEFORE parseLLMResponse
  const parseSearchReplace = useCallback((content) => {
    if (!content || typeof content !== 'string' || content.length < 20) {
      return [];
    }
    
    const operations = [];
    const searchReplaceRegex = /<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;
    
    let match;
    let count = 0;
    while ((match = searchReplaceRegex.exec(content)) !== null && count < 10) {
      operations.push({
        search: match[1],
        replace: match[2],
        type: 'search_replace'
      });
      count++;
    }
    
    return operations;
  }, []);
  
  // 🎯 APPLY SEARCH/REPLACE
  const applySearchReplace = useCallback((originalContent, operations) => {
    if (!originalContent || !operations || operations.length === 0) {
      return { result: originalContent, appliedCount: 0, failedOps: [] };
    }
    
    let result = originalContent;
    let appliedCount = 0;
    let failedOps = [];
    
    const limitedOperations = operations.slice(0, 20);
    
    // Normalize whitespace for comparison while preserving structure
    const normalizeForComparison = (str) => {
      // Preserve line structure but normalize spaces/tabs within lines
      return str.split('\n').map(line => {
        const leadingWhitespace = line.match(/^[\s]*/)[0];
        const content = line.trim();
        return { leadingWhitespace, content, original: line };
      });
    };
    
    // Sort operations to apply them from the end to beginning
    const sortedOperations = [...limitedOperations].map((op, index) => ({
      ...op,
      originalIndex: index
    }));
    
    // Apply operations in reverse order to maintain string indices
    for (let i = sortedOperations.length - 1; i >= 0; i--) {
      const op = sortedOperations[i];
      const { search, replace } = op;
      
      // First try exact match
      let lastIndex = result.lastIndexOf(search);
      
      // If exact match fails, try fuzzy matching with normalized whitespace
      if (lastIndex === -1) {
        const searchLines = normalizeForComparison(search);
        const resultLines = result.split('\n');
        
        // Try to find a fuzzy match
        for (let startIdx = resultLines.length - 1; startIdx >= 0; startIdx--) {
          let matchFound = true;
          const potentialMatch = [];
          
          for (let j = 0; j < searchLines.length && startIdx + j < resultLines.length; j++) {
            const resultLine = resultLines[startIdx + j];
            const searchLine = searchLines[j];
            
            // Compare content, ignoring differences in indentation amount
            const resultContent = resultLine.trim();
            
            if (resultContent !== searchLine.content) {
              matchFound = false;
              break;
            }
            potentialMatch.push(resultLines[startIdx + j]);
          }
          
          if (matchFound && potentialMatch.length === searchLines.length) {
            // Found a fuzzy match - replace it
            const matchStr = potentialMatch.join('\n');
            const beforeMatch = resultLines.slice(0, startIdx).join('\n');
            const afterMatch = resultLines.slice(startIdx + searchLines.length).join('\n');
            
            result = beforeMatch + 
                    (beforeMatch ? '\n' : '') + 
                    replace + 
                    (afterMatch ? '\n' : '') + 
                    afterMatch;
            appliedCount++;
            lastIndex = 0; // Mark as found
            break;
          }
        }
      } else {
        // Exact match found
        result = result.substring(0, lastIndex) + 
                 replace + 
                 result.substring(lastIndex + search.length);
        appliedCount++;
      }
      
      if (lastIndex === -1) {
        failedOps.push({ 
          index: op.originalIndex + 1, 
          search: search.substring(0, 100) + (search.length > 100 ? '...' : ''),
          reason: 'No exact or fuzzy match found. Check whitespace and indentation.',
          debug: {
            searchLength: search.length,
            searchLines: search.split('\n').length,
            searchFirst50: search.substring(0, 50).replace(/\n/g, '\\n'),
            resultFirst50: result.substring(0, 50).replace(/\n/g, '\\n')
          }
        });
      }
    }
    
    return { result, appliedCount, failedOps };
  }, []);

  // 🎯 STRING SIMILARITY HELPER
  const calculateSimilarity = useCallback((str1, str2) => {
    if (str1 === str2) return 1;
    
    const cleanStr1 = str1.replace(/\s+/g, ' ').trim();
    const cleanStr2 = str2.replace(/\s+/g, ' ').trim();
    
    if (cleanStr1 === cleanStr2) return 1;
    if (cleanStr1.includes(cleanStr2) || cleanStr2.includes(cleanStr1)) return 0.9;
    
    const maxLen = 1000;
    const limitedStr1 = cleanStr1.length > maxLen ? cleanStr1.substring(0, maxLen) : cleanStr1;
    const limitedStr2 = cleanStr2.length > maxLen ? cleanStr2.substring(0, maxLen) : cleanStr2;
    
    const set1 = new Set(limitedStr1.split(/\s+/));
    const set2 = new Set(limitedStr2.split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }, []);

  // 🎯 PARSE LLM RESPONSE - MUST BE AFTER parseSearchReplace
  const parseLLMResponse = useCallback((message) => {
    try {
      if (!message || typeof message !== 'string') {
        return { content: '', artifacts: [], edits: [] };
      }

      const maxMessageSize = 50000;
      const limitedMessage = message.length > maxMessageSize 
        ? message.substring(0, maxMessageSize) + '\n... (truncated for performance)' 
        : message;

      const artifacts = [];
      const edits = [];
      let regularContent = limitedMessage;

      // Parse edit blocks
      const editBlockRegex = /```(?:edit)?\s*\r?\n([\s\S]*?)\r?\n```/gi;
      const editBlocks = [];
      let editMatch;
      
      while ((editMatch = editBlockRegex.exec(limitedMessage)) !== null && editBlocks.length < 5) {
        editBlocks.push({
          fullMatch: editMatch[0],
          content: editMatch[1],
          index: editMatch.index
        });
      }

      // Map to consolidate edits for the same file
      const editsByFile = new Map();
      
      for (const block of editBlocks) {
        const fileMarkerMatch = block.content.match(/(?:@@@|\/\/\/|#|File:|file:|filename:)\s*(.+)/i);
        let targetFile = null;
        let editContent = block.content;
        
        if (fileMarkerMatch) {
          targetFile = validateAndSanitizePath(fileMarkerMatch[1].trim());
          editContent = block.content.replace(fileMarkerMatch[0], '').trim();
        } else {
          // Try to find file marker in the first few lines
          const lines = block.content.split('\n');
          for (let i = 0; i < Math.min(3, lines.length); i++) {
            const lineMatch = lines[i].match(/(?:@@@|\/\/\/|#|File:|file:|filename:)\s*(.+)/i);
            if (lineMatch) {
              targetFile = validateAndSanitizePath(lineMatch[1].trim());
              // Remove the file marker line from editContent
              editContent = lines.slice(i + 1).join('\n').trim();
              break;
            }
          }
        }
        
        const operations = parseSearchReplace(editContent);
        
        if (operations.length > 0) {
          regularContent = regularContent.replace(block.fullMatch, '');
          
          const finalPath = targetFile || 'unknown';
          
          // Check if we already have edits for this file
          if (editsByFile.has(finalPath)) {
            // Append operations to existing edit
            const existingEdit = editsByFile.get(finalPath);
            existingEdit.operations.push(...operations);
            existingEdit.operationCount += operations.length;
          } else {
            // Create new edit group
            const editGroup = {
              path: finalPath,
              operations: operations,
              id: generateSafeId(`edit-${finalPath}`),
              type: 'search_replace',
              timestamp: new Date().toISOString(),
              rawContent: block.fullMatch,
              parsedContent: editContent,
              applied: false,
              operationCount: operations.length
            };
            
            editsByFile.set(finalPath, editGroup);
          }
        }
      }
      
      // Convert map values to array
      const consolidatedEdits = Array.from(editsByFile.values());
      edits.push(...consolidatedEdits);

      // Parse file creation blocks - ENHANCED with more patterns
      const filePatterns = [
        // Pattern 1: // filename: path or # filename: path
        /```(\w+)?\s*\r?\n\s*(?:\/\/|#)\s*(?:filename|file):\s*([^\r\n]+)\r?\n([\s\S]*?)```/gi,
        // Pattern 2: /* filename: path */
        /```(\w+)?\s*\r?\n\s*\/\*\s*(?:filename|file):\s*([^\r\n]+?)\s*\*\/\r?\n([\s\S]*?)```/gi,
        // Pattern 3: Filename at top (no comment syntax)
        /```(\w+)?\s*\r?\n\s*([a-zA-Z0-9_\-\/\.]+\.\w+)\r?\n([\s\S]*?)```/gi,
      ];

      for (const pattern of filePatterns) {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(regularContent)) !== null && artifacts.length < 10) {
          const language = match[1] || 'text';
          const rawFilePath = match[2].trim();
          const content = match[3].trim();
          
          // Skip if this looks like edit syntax
          if (content.includes('<<<<<<< SEARCH') || content.includes('=======') || content.includes('>>>>>>> REPLACE')) {
            continue;
          }
          
          // Skip if the "filename" looks like actual code
          if (rawFilePath.includes('(') || rawFilePath.includes('{') || rawFilePath.includes('=')) {
            continue;
          }
          
          const filePath = validateAndSanitizePath(rawFilePath);
          const detectedLanguage = language === 'text' ? getLanguageFromPath(filePath) : language;
          
          const artifact = {
            path: filePath,
            content: content,
            language: detectedLanguage,
            id: generateSafeId(`artifact-${filePath}`),
            type: 'file',
            createdBy: 'ai',
            timestamp: new Date().toISOString(),
            source: 'parsed',
            // Add metadata for display
            lineCount: content.split('\n').length,
            size: content.length,
            addedToProject: false // Will be set to true when added
          };
          
          artifacts.push(artifact);
          regularContent = regularContent.replace(match[0], '');
        }
      }

      // Also look for inline file markers without code blocks
      const inlineFilePatterns = [
        /File:\s*([^\s]+)\s*\n```(\w+)?\s*\n([\s\S]*?)```/gi,
        /filename:\s*([^\s]+)\s*\n```(\w+)?\s*\n([\s\S]*?)```/gi,
        /##\s*FILE:\s*([^\n]+)\s*\n```(\w+)?\s*\n([\s\S]*?)```/gi
      ];
      
      for (const pattern of inlineFilePatterns) {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(regularContent)) !== null && artifacts.length < 5) {
          const rawFilePath = match[1].trim();
          const language = match[2] || 'text';
          const content = match[3].trim();
          
          if (content.includes('<<<<<<< SEARCH') || content.includes('=======') || content.includes('>>>>>>> REPLACE')) {
            continue;
          }
          
          const filePath = validateAndSanitizePath(rawFilePath);
          const detectedLanguage = language === 'text' ? getLanguageFromPath(filePath) : language;
          
          const artifact = {
            path: filePath,
            content: content,
            language: detectedLanguage,
            id: generateSafeId(`artifact-${filePath}`),
            type: 'file',
            createdBy: 'ai',
            timestamp: new Date().toISOString(),
            source: 'inline',
            lineCount: content.split('\n').length,
            size: content.length,
            addedToProject: false
          };
          
          artifacts.push(artifact);
          regularContent = regularContent.replace(match[0], '');
        }
      }

      // Clean up regular content
      regularContent = regularContent
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .replace(/^\s+|\s+$/g, '')
        .trim();

      // Parse instructions if any
      const instructions = [];
      if (regularContent.includes('1.') || regularContent.includes('First,') || regularContent.includes('Step')) {
        const instructionLines = regularContent.split('\n').filter(line => 
          line.trim().match(/^\d+\./) || 
          line.trim().toLowerCase().startsWith('step') ||
          line.trim().toLowerCase().startsWith('first') ||
          line.trim().toLowerCase().startsWith('next') ||
          line.trim().toLowerCase().startsWith('then') ||
          line.trim().toLowerCase().startsWith('finally')
        ).slice(0, 10);
        
        if (instructionLines.length > 0) {
          instructions.push(...instructionLines.map(line => line.trim()));
        }
      }

      return {
        content: regularContent,
        artifacts: artifacts.slice(0, 10),
        edits: edits.slice(0, 5),
        instructions: instructions,
        metadata: {
          totalArtifacts: artifacts.length,
          totalEdits: edits.length,
          parsedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error parsing LLM response:', error);
      return { 
        content: message, 
        artifacts: [], 
        edits: [],
        instructions: [],
        metadata: {
          totalArtifacts: 0,
          totalEdits: 0,
          parsedAt: new Date().toISOString(),
          error: error.message
        }
      };
    }
  }, [parseSearchReplace]);

const saveArtifacts = useCallback((newArtifacts) => {
  try {
    console.log("💾 [SAVE] Saving artifacts to localStorage:", 
      Object.keys(newArtifacts).length, "conversations");
    
    // If artifacts are empty, remove from localStorage
    if (!newArtifacts || Object.keys(newArtifacts).length === 0) {
      console.log("💾 [SAVE] No artifacts to save, removing from localStorage");
      localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS);
      return;
    }
    
    // Save the artifacts
    const dataSize = new Blob([JSON.stringify(newArtifacts)]).size;
    if (dataSize > APP_CONFIG.LIMITS.MAX_STORAGE_BYTES * 0.9) {
      console.warn('💾 [SAVE] Storage approaching limit');
    }
    
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS, JSON.stringify(newArtifacts));
    console.log("💾 [SAVE] Artifacts saved successfully");
  } catch (error) {
    console.error('❌ [SAVE] Error saving artifacts:', error);
  }
}, []);
  
  const saveSelectedModel = useCallback((modelName) => {
    try {
      const asString = typeof modelName === "string"
        ? modelName
        : modelName?.toString?.() ?? "";
  
      if (asString.trim()) {
        localStorage.setItem("ollama-selected-model", asString);
      }
    } catch (error) {
      console.error("Error saving selected model:", error);
    }
  }, []);

  // 🎯 ADD THIS: Save conversations function
  const saveConversations = useCallback((updatedConversations = conversations) => {
    try {
      console.log("💾 [SAVE] Saving conversations:", updatedConversations.length);
      
      // Update current conversation with latest messages
      const conversationsWithCurrentUpdated = updatedConversations.map(conv => 
        conv.id === currentConversationId 
          ? { 
              ...conv, 
              messages: messages,
              lastUpdated: new Date().toISOString(),
              title: messages.length > 0 
                ? (messages[0]?.content?.substring(0, 50) + (messages[0]?.content?.length > 50 ? '...' : '')) 
                : conv.title || 'New Conversation'
            }
          : conv
      );
      
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversationsWithCurrentUpdated));
      setConversations(conversationsWithCurrentUpdated);
      
      console.log("💾 [SAVE] Conversations saved successfully");
    } catch (error) {
      console.error("❌ [SAVE] Error saving conversations:", error);
    }
  }, [currentConversationId, messages, conversations]);

  const getStorageInfo = useCallback(() => {
    try {
      const artifactsSize = new Blob([JSON.stringify(artifacts)]).size;
      const conversationsSize = new Blob([JSON.stringify(conversations)]).size;
      const totalSize = artifactsSize + conversationsSize;
      
      const conversationCount = Object.keys(artifacts).length;
      const totalFiles = Object.values(artifacts).reduce((sum, files) => sum + files.length, 0);
      
      return {
        totalSize,
        artifactsSize,
        conversationsSize,
        conversationCount,
        totalFiles,
        storageUsage: (totalSize / APP_CONFIG.LIMITS.MAX_STORAGE_BYTES) * 100,
        isNearLimit: totalSize > APP_CONFIG.LIMITS.MAX_STORAGE_BYTES * 0.8
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        totalSize: 0,
        artifactsSize: 0,
        conversationsSize: 0,
        conversationCount: 0,
        totalFiles: 0,
        storageUsage: 0,
        isNearLimit: false
      };
    }
  }, [artifacts, conversations]);

  const findTargetFileForEdit = useCallback((artifacts, editPath) => {
    if (!artifacts || artifacts.length === 0) return null;
    
    const limitedArtifacts = artifacts.slice(0, 50);
    
    const normalizePath = (path) => path.toLowerCase().replace(/\\/g, '/').replace(/^\.?\//, '');
    const normalizedEditPath = normalizePath(editPath);
    
    for (const art of limitedArtifacts) {
      if (normalizePath(art.path) === normalizedEditPath) return art;
    }
    
    const editFileName = normalizedEditPath.split('/').pop();
    for (const art of limitedArtifacts) {
      if (normalizePath(art.path).split('/').pop() === editFileName) return art;
    }
    
    for (const art of limitedArtifacts) {
      if (normalizePath(art.path).includes(normalizedEditPath) || 
          normalizedEditPath.includes(normalizePath(art.path))) {
        return art;
      }
    }
    
    return null;
  }, []);

  const getEnhancedFileContext = useCallback((artifacts, userInput, currentEdits = []) => {
    if (artifacts.length === 0) {
      return '\n\nPROJECT CONTEXT: No existing files. Starting fresh project.';
    }

    const contextParts = [];
    contextParts.push('## EXISTING PROJECT FILES (You MUST read these before editing):');
    contextParts.push('CRITICAL: When making edits, your SEARCH blocks MUST match EXACT lines from these files.');
    
    const filesToShow = artifacts.slice(0, 15);
    
    filesToShow.forEach(file => {
      const lineCount = file.content.split('\n').length;
      
      const maxContentLength = 2000;
      let content = file.content;
      if (content.length > maxContentLength) {
        content = content.substring(0, maxContentLength) + '\n// ... (content truncated for context)';
      }
      
      contextParts.push(`### FILE: ${file.path} (${lineCount} lines, ${file.language})`);
      contextParts.push('```' + file.language);
      contextParts.push(content);
      contextParts.push('```');
      contextParts.push('');
    });

    if (artifacts.length > 15) {
      contextParts.push(`... and ${artifacts.length - 15} more files (truncated for performance)`);
    }

    contextParts.push('## EDITING INSTRUCTIONS:');
    contextParts.push('1. BEFORE writing any SEARCH/REPLACE blocks, examine the relevant file above');
    contextParts.push('2. Copy the EXACT lines you want to change (including all whitespace)');
    contextParts.push('3. If changing multiple lines, include them all in SEARCH block');
    
    if (currentEdits.length > 0) {
      contextParts.push('\n## RECENT EDITS (for reference):');
      currentEdits.slice(-2).forEach((edit, idx) => {
        contextParts.push(`${idx + 1}. ${edit.path}: ${edit.operationCount} operations`);
      });
    }

    return contextParts.join('\n');
  }, []);

  // 🎯 USE EFFECTS
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      if (mobile !== isMobile) setIsMobile(mobile);
    };
    
    let resizeTimer;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkMobile, 100);
    };
    
    checkMobile();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [isMobile]);

  useEffect(() => {
    if (initialLoadComplete) {
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS, showArtifacts.toString());
    }
  }, [showArtifacts, initialLoadComplete]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    
    const allEdits = [];
    const recentMessages = messages.slice(-20);
    
    for (const msg of recentMessages) {
      if (msg.parsedResponse?.edits) {
        allEdits.push(...msg.parsedResponse.edits.slice(0, 3));
      }
    }
    setCurrentEdits(allEdits);
  }, [messages, initialLoadComplete]);

  const handleArtifactUpdate = useCallback((newArtifacts) => {
    console.log("🔄 [DEBUG] handleArtifactUpdate called with:", newArtifacts.length, "artifacts");
    console.log("🔄 [DEBUG] Current conversation ID:", currentConversationId);
    
    if (!currentConversationId) {
      console.error("❌ [DEBUG] No current conversation ID - creating new one");
      const newConvId = generateSafeId('conv');
      setCurrentConversationId(newConvId);
      
      const deduplicated = deduplicateArtifacts(newArtifacts);
      const updatedArtifacts = { 
        [newConvId]: deduplicated 
      };
      
      console.log("🔄 [DEBUG] Setting artifacts with new conversation ID");
      setArtifacts(updatedArtifacts);
      
      setTimeout(() => {
        try {
          saveArtifacts(updatedArtifacts);
          console.log("💾 [DEBUG] Artifacts saved to localStorage with new conversation");
        } catch (error) {
          console.error("❌ [DEBUG] Error saving artifacts:", error);
        }
      }, 50);
      return;
    }
    
    // Remove duplicates before updating
    const deduplicated = deduplicateArtifacts(newArtifacts);
    console.log("🔄 [DEBUG] After deduplication:", deduplicated.length, "artifacts");
    
    const updatedArtifacts = { 
      ...artifacts, 
      [currentConversationId]: deduplicated 
    };
    
    console.log("🔄 [DEBUG] Setting artifacts state...");
    setArtifacts(updatedArtifacts);
    
    // Force a state update to ensure UI refreshes
    setTimeout(() => {
      try {
        saveArtifacts(updatedArtifacts);
        console.log("💾 [DEBUG] Artifacts saved to localStorage");
      } catch (error) {
        console.error("❌ [DEBUG] Error saving artifacts:", error);
      }
    }, 50);
  }, [artifacts, currentConversationId, saveArtifacts]);

  // 🎯 FIXED: Save messages with conversation linking
  useEffect(() => {
    if (!initialLoadComplete || !currentConversationId || messages.length === 0) return;
    
    const timer = setTimeout(() => {
      try {
        // Save to conversations array
        const updatedConversations = conversations.map(conv => 
          conv.id === currentConversationId 
            ? { 
                ...conv, 
                messages: messages,
                lastUpdated: new Date().toISOString(),
                artifactCount: currentArtifacts.length,
                title: messages.length > 0 
                  ? (messages[0]?.content?.substring(0, 50) + (messages[0]?.content?.length > 50 ? '...' : '')) 
                  : conv.title || 'New Conversation'
              }
            : conv
        );
        
        setConversations(updatedConversations);
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
        
        // Also save to legacy storage for backward compatibility
        localStorage.setItem("ollama-chat-history", JSON.stringify(messages));
        
        console.log("💾 [SAVE] Saved messages to conversation:", currentConversationId);
      } catch (error) {
        console.error('Error saving messages:', error);
      }
    }, 500); // Increased delay to prevent rapid saves
    
    return () => clearTimeout(timer);
  }, [messages, currentConversationId, conversations, initialLoadComplete, currentArtifacts.length]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    
    localStorage.setItem("ollama-additional-system-prompt", systemPrompt);
  }, [systemPrompt, initialLoadComplete]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    
    if (conversations.length > 0) {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
        } catch (error) {
          console.error('Error saving conversations:', error);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [conversations, initialLoadComplete]);

  // 🎯 ADD THIS: Periodic saving of conversation state
  useEffect(() => {
    if (!initialLoadComplete || !currentConversationId) return;
    
    const saveInterval = setInterval(() => {
      if (messages.length > 0) {
        const updatedConversations = conversations.map(conv => 
          conv.id === currentConversationId 
            ? { 
                ...conv, 
                messages: messages,
                lastUpdated: new Date().toISOString()
              }
            : conv
        );
        
        try {
          localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
        } catch (error) {
          console.warn('Periodic save failed:', error);
        }
      }
    }, 30000); // Save every 30 seconds
    
    return () => clearInterval(saveInterval);
  }, [initialLoadComplete, currentConversationId, messages, conversations]);

  useEffect(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    
    loadTimerRef.current = setTimeout(() => {
      try {
        console.log("🔄 [LOAD] Starting initial load...");
        
        // Load conversations FIRST
        const savedConversations = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS);
        console.log("🔄 [LOAD] Saved conversations found:", savedConversations ? "YES" : "NO");
        
        let loadedConversations = [];
        if (savedConversations) {
          try {
            loadedConversations = JSON.parse(savedConversations);
            console.log("🔄 [LOAD] Parsed conversations:", loadedConversations.length);
          } catch (error) {
            console.error("❌ [LOAD] Error parsing conversations:", error);
            loadedConversations = [];
          }
        }
        
        // Load artifacts
        const savedArtifacts = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS);
        let loadedArtifacts = {};
        if (savedArtifacts) {
          try {
            loadedArtifacts = JSON.parse(savedArtifacts);
            console.log("🔄 [LOAD] Loaded artifacts for", Object.keys(loadedArtifacts).length, "conversations");
          } catch (error) {
            console.error("❌ [LOAD] Error parsing artifacts:", error);
            loadedArtifacts = {};
          }
        }
        
        // If no conversations exist, create a default one
        if (loadedConversations.length === 0) {
          console.log("🔄 [LOAD] No conversations found, creating default...");
          const newConvId = generateSafeId('conv');
          const defaultConversation = {
            id: newConvId,
            title: 'New Conversation',
            messages: [],
            lastUpdated: new Date().toISOString(),
            active: true,
            artifactCount: 0
          };
          
          loadedConversations = [defaultConversation];
          loadedArtifacts[newConvId] = [];
          
          // Save the new default conversation
          localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(loadedConversations));
          localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS, JSON.stringify(loadedArtifacts));
          
          console.log("🔄 [LOAD] Created default conversation:", newConvId);
        }
        
        // Set the active conversation (first active one or first in list)
        const activeConv = loadedConversations.find(c => c.active) || loadedConversations[0];
        const activeConvId = activeConv?.id;
        
        console.log("🔄 [LOAD] Setting active conversation:", activeConvId);
        
        // Set states
        setConversations(loadedConversations);
        setArtifacts(loadedArtifacts);
        setCurrentConversationId(activeConvId);
        
        // Load messages for active conversation
        if (activeConv && activeConv.messages) {
          console.log("🔄 [LOAD] Loading messages for active conversation:", activeConv.messages.length);
          setMessages(activeConv.messages);
        }
        
        // Load other settings
        const savedPrompt = localStorage.getItem("ollama-additional-system-prompt");
        if (savedPrompt) setSystemPrompt(savedPrompt);
        
        const savedModel = localStorage.getItem("ollama-selected-model");
        if (savedModel) setSelectedModel(savedModel);
        
        // Check if we should show artifacts
        const conversationArtifacts = loadedArtifacts[activeConvId] || [];
        if (conversationArtifacts.length > 0) {
          const savedPreference = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS);
          const shouldShow = savedPreference === null ? true : savedPreference === 'true';
          setShowArtifacts(shouldShow);
          setShowEmptyState(false);
        } else {
          setShowArtifacts(false);
          setShowEmptyState(true);
        }
        
        console.log("🔄 [LOAD] Initial load complete");
        setInitialLoadComplete(true);
        
      } catch (error) {
        console.error("❌ [LOAD] Initial load error:", error);
        // Create a fresh state on error
        createNewConversation();
        setInitialLoadComplete(true);
      }
    }, 50);
    
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, []);
  
  // 🎯 ADD THIS RIGHT AFTER THE INITIAL LOAD useEffect - FETCH MODELS ON LOAD
  useEffect(() => {
    if (initialLoadComplete) {
      const timer = setTimeout(() => {
        fetchModels();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialLoadComplete]);

  // Add this useEffect to properly initialize when conversation loads
  useEffect(() => {
    if (!initialLoadComplete || !currentConversationId) return;
    
    console.log("🔄 [CONVO] Current conversation changed:", currentConversationId);
    console.log("🔄 [CONVO] Available artifacts for this conversation:", 
      artifacts[currentConversationId]?.length || 0, "files");
    
    // If this conversation has artifacts, don't show empty state
    if (artifacts[currentConversationId] && artifacts[currentConversationId].length > 0) {
      console.log("🔄 [CONVO] Conversation has artifacts, hiding empty state");
      setShowEmptyState(false);
      
      // Auto-show artifacts panel if there are files
      const savedPreference = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS);
      const shouldShow = savedPreference === null ? true : savedPreference === 'true';
      if (shouldShow && !showArtifacts) {
        console.log("🔄 [CONVO] Auto-showing artifacts panel");
        setShowArtifacts(true);
      }
    } else {
      console.log("🔄 [CONVO] Conversation has no artifacts, showing empty state");
      setShowEmptyState(true);
    }
  }, [currentConversationId, artifacts, initialLoadComplete, showArtifacts]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, []);

  // Close create menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
    };
    
    if (showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCreateMenu]);

  // Focus folder input when creating folder
  useEffect(() => {
    if (creatingFolder && folderInputRef.current) {
      folderInputRef.current.focus();
    }
  }, [creatingFolder]);

  // 🎯 SCROLL HANDLING
  const handleScroll = useCallback(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    
    scrollTimerRef.current = setTimeout(() => {
      if (!messagesContainerRef.current) return;
      const container = messagesContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < APP_CONFIG.TIMEOUTS.AUTO_SCROLL_PADDING;
      
      if (isNearBottom || messages.length <= 2) {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    }, 100);
  }, [messages.length]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (messages.length > 0 && messagesContainerRef.current) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // 🎯 EVENT HANDLERS
  const handleImageSelect = useCallback((file) => {
    if (file && file.type.startsWith('image/')) {
      if (file.size > APP_CONFIG.LIMITS.MAX_IMAGE_SIZE) {
        setOllamaError(`Image too large. Max: ${APP_CONFIG.LIMITS.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
      setOllamaError(null);
    }
  }, []);

  const removeImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const copyToClipboard = useCallback(async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(null), APP_CONFIG.TIMEOUTS.COPY_FEEDBACK);
    } catch (err) { console.error("Copy failed:", err); }
  }, []);

  const clearChat = useCallback(() => {
    if (!confirm("Clear all messages? This cannot be undone.")) return;
    
    setMessages([]);
    setImageFile(null);
    setImagePreview(null);
    
    if (currentConversationId) {
      const updatedArtifacts = { ...artifacts };
      delete updatedArtifacts[currentConversationId];
      setArtifacts(updatedArtifacts);
      saveArtifacts(updatedArtifacts);
    }
  }, [currentConversationId, artifacts, saveArtifacts]);

  const createNewConversation = useCallback(() => {
    console.log("🔄 [NEW] Creating new conversation...");
    
    const newConversation = {
      id: generateSafeId('conv'),
      title: 'New Conversation',
      messages: [],
      lastUpdated: new Date().toISOString(),
      active: true,
      artifactCount: 0
    };
    
    // Deactivate all other conversations
    const updatedConversations = conversations.map(conv => ({ 
      ...conv, 
      active: false 
    }));
    
    // Add the new conversation at the beginning
    updatedConversations.unshift(newConversation);
    
    // Update states
    setConversations(updatedConversations);
    setCurrentConversationId(newConversation.id);
    setMessages([]);
    setImageFile(null);
    setImagePreview(null);
    setShowSidePanel(false);
    setShowArtifacts(false);
    setShowEmptyState(true);
    
    // Update artifacts for the new conversation
    const updatedArtifacts = { ...artifacts, [newConversation.id]: [] };
    setArtifacts(updatedArtifacts);
    
    // Save everything
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS, JSON.stringify(updatedArtifacts));
    localStorage.setItem("ollama-chat-history", JSON.stringify([]));
    
    console.log("🔄 [NEW] Created new conversation:", newConversation.id);
  }, [conversations, artifacts]);

  const selectConversation = useCallback((conversation) => {
    console.log("🔄 [SELECT] Selecting conversation:", conversation.id);
    
    // Save current conversation state if it exists
    if (currentConversationId && messages.length > 0) {
      const updatedConversations = conversations.map(conv => 
        conv.id === currentConversationId 
          ? { 
              ...conv, 
              messages: messages,
              lastUpdated: new Date().toISOString(),
              title: messages.length > 0 
                ? (messages[0]?.content?.substring(0, 50) + (messages[0]?.content?.length > 50 ? '...' : '')) 
                : conv.title || 'New Conversation'
            }
          : conv
      );
      
      // Update conversations with saved messages
      setConversations(updatedConversations);
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
    }
    
    // Update all conversations to set active state
    const updatedConversations = conversations.map(conv => ({ 
      ...conv, 
      active: conv.id === conversation.id 
    }));
    
    setConversations(updatedConversations);
    setCurrentConversationId(conversation.id);
    
    // Load messages for selected conversation
    const conversationMessages = conversation.messages || [];
    console.log("🔄 [SELECT] Loading messages:", conversationMessages.length);
    setMessages(conversationMessages);
    
    // Update legacy storage for compatibility
    localStorage.setItem("ollama-chat-history", JSON.stringify(conversationMessages));
    
    // Reset UI
    setImageFile(null);
    setImagePreview(null);
    setShowSidePanel(false);
    
    // Check artifacts for this conversation
    const conversationArtifacts = artifacts[conversation.id] || [];
    console.log("🔄 [SELECT] Conversation artifacts:", conversationArtifacts.length);
    
    if (conversationArtifacts.length > 0) {
      const savedPreference = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS);
      const shouldShow = savedPreference === null ? true : savedPreference === 'true';
      setShowArtifacts(shouldShow);
      setShowEmptyState(false);
    } else {
      setShowArtifacts(false);
      setShowEmptyState(true);
    }
    
    // Save the updated conversations
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
    
    console.log("🔄 [SELECT] Selection complete");
  }, [conversations, currentConversationId, messages, artifacts]);

  const deleteConversation = useCallback((conversationId) => {
    if (!confirm("Delete this conversation?")) return;
    
    const isDeletingCurrent = currentConversationId === conversationId;
    
    if (isDeletingCurrent) {
      setMessages([]);
      setImageFile(null);
      setImagePreview(null);
      setShowEmptyState(true);
    }
    
    const updatedArtifacts = { ...artifacts };
    delete updatedArtifacts[conversationId];
    setArtifacts(updatedArtifacts);
    saveArtifacts(updatedArtifacts);
    
    setConversations(prev => {
      const updated = prev.filter(conv => conv.id !== conversationId);
      
      if (isDeletingCurrent && updated.length > 0) {
        const nextConv = updated[0];
        setCurrentConversationId(nextConv.id);
        setMessages(nextConv.messages || []);
        return updated.map((conv, idx) => ({ ...conv, active: idx === 0 }));
      } else if (isDeletingCurrent) {
        setCurrentConversationId(null);
      }
      
      return updated;
    });
  }, [currentConversationId, artifacts, saveArtifacts]);

const clearAllConversations = useCallback(() => {
  if (!confirm("Clear all conversations? This cannot be undone.")) return;
  
  console.log("🗑️ [CLEAR] Clearing all conversations...");
  
  // Create a new conversation ID first
  const newConvId = generateSafeId('conv');
  
  // Create the new conversation object
  const newConversation = {
    id: newConvId,
    title: 'New Conversation',
    messages: [],
    lastUpdated: new Date().toISOString(),
    active: true,
    artifactCount: 0
  };
  
  // Create new empty artifacts object with just this conversation
  const newArtifacts = { [newConvId]: [] };
  
  // Update ALL state in one go to avoid multiple renders
  setConversations([newConversation]);
  setCurrentConversationId(newConvId);
  setMessages([]);
  setImageFile(null);
  setImagePreview(null);
  setShowEmptyState(true);
  setArtifacts(newArtifacts);
  setShowSidePanel(false);
  setShowArtifacts(false);
  
  // Save everything to localStorage
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify([newConversation]));
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS, JSON.stringify(newArtifacts));
  localStorage.setItem("ollama-chat-history", JSON.stringify([]));
  
  // Also call saveArtifacts to ensure consistency
  saveArtifacts(newArtifacts);
  
  console.log("🗑️ [CLEAR] Cleared all conversations, created new one:", newConvId);
}, [saveArtifacts]); // Remove createNewConversation dependency

  const exportConversations = useCallback(() => {
    const data = JSON.stringify({ conversations, artifacts }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ollama-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [conversations, artifacts]);

  const importConversations = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (imported.conversations) setConversations(imported.conversations);
            if (imported.artifacts) {
              setArtifacts(imported.artifacts);
              saveArtifacts(imported.artifacts);
            }
            setShowSidePanel(false);
            setShowEmptyState(false);
          } catch { alert('Invalid file'); }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [saveArtifacts]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    if (value.length <= APP_CONFIG.LIMITS.MAX_INPUT_LENGTH) {
      setInput(value);
      const ta = textareaRef.current;
      if (ta) { 
        ta.style.height = "auto"; 
        setTimeout(() => {
          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
        }, 10);
      }
    }
  }, []);

  const fetchModels = useCallback(async (isRetry = false) => {
    setIsLoadingModels(true);
    setOllamaError(null);
  
    try {
      const response = await fetch(`${APP_CONFIG.OLLAMA_BASE}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
      const data = await response.json();
      if (!data.models || data.models.length === 0) {
        setModels({ cloud: [], nonCloud: [] });
        setSelectedModel("");
        setOllamaError("No models found. Pull a model first.");
        return;
      }
  
      const modelNames = data.models.map(m => m.name).sort();
      const cloudModels = modelNames.filter(n => n.toLowerCase().includes('cloud') || n.includes(':cloud'));
      const nonCloudModels = modelNames.filter(n => !cloudModels.includes(n));
  
      setModels({ cloud: cloudModels, nonCloud: nonCloudModels });
      
      // Check for saved model first
      const savedModel = localStorage.getItem("ollama-selected-model");
      let modelToSelect = "";
      
      if (savedModel && modelNames.includes(savedModel)) {
        // If saved model exists in the list, use it
        modelToSelect = savedModel;
      } else if (cloudModels.length > 0) {
        // Otherwise default to first cloud model
        modelToSelect = cloudModels[0];
      } else if (nonCloudModels.length > 0) {
        // Or first non-cloud model
        modelToSelect = nonCloudModels[0];
      }
      setSelectedModel(modelToSelect);
      saveSelectedModel(modelToSelect);
      setRetryCount(0);
    } catch (err) {
      if (isRetry && retryCount < 3) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => fetchModels(true), APP_CONFIG.TIMEOUTS.RETRY_DELAY * retryCount);
        return;
      }
      setOllamaError("Cannot connect to Ollama. Make sure it's running.");
      setModels({ cloud: [], nonCloud: [] });
      setSelectedModel("");
    } finally {
      setIsLoadingModels(false);
    }
  }, [retryCount]);

  const getFileContext = useCallback(() => {
    return getEnhancedFileContext(currentArtifacts, input, currentEdits);
  }, [currentArtifacts, input, currentEdits, getEnhancedFileContext]);

  // 🎯 CREATE NEW FILE FUNCTION - FIXED VERSION
  const handleCreateNewFile = useCallback((folderPath = '') => {
    const defaultExtensions = {
      'src/components': '.jsx',
      'src': '.js',
      'styles': '.css',
      'utils': '.js',
      'public': '.html',
      '': '.txt'
    };
    
    let extension = '.txt';
    for (const [path, ext] of Object.entries(defaultExtensions)) {
      if (folderPath.includes(path) || (!folderPath && path === '')) {
        extension = ext;
        break;
      }
    }
    
    const newFileName = `${folderPath ? folderPath + '/' : ''}new-file-${Date.now()}${extension}`;
    const language = getLanguageFromPath(newFileName);
    
    const defaultContent = {
      'jsx': `// ${newFileName}
import React from 'react';

export default function NewComponent() {
  return (
    <div>
      New Component
    </div>
  );
}`,
      'js': `// ${newFileName}
function newFunction() {
  console.log('Hello World');
}`,
      'css': `/* ${newFileName} */
.new-class {
  color: blue;
}`,
      'html': `<!-- ${newFileName} -->
<!DOCTYPE html>
<html>
<head>
  <title>New File</title>
</head>
<body>
  <h1>New File</h1>
</body>
</html>`,
      'py': `# ${newFileName}
def main():
    print("Hello World")

if __name__ == "__main__":
    main()`,
      'json': `{
  "name": "new-file",
  "version": "1.0.0"
}`
    }[language] || `// ${newFileName}\n// New file created`;

    const newFile = {
      path: newFileName,
      content: defaultContent,
      language: language,
      id: generateSafeId(newFileName),
      name: newFileName.split('/').pop(),
      fullPath: newFileName,
      type: 'file',
      createdBy: 'user',
      timestamp: new Date().toISOString()
    };
    
    const updatedArtifacts = [...currentArtifacts, newFile];
    handleArtifactUpdate(updatedArtifacts);
    
    // Set as selected and open for editing
    setTimeout(() => {
      setSelectedFile(newFile);
      setEditedContent(newFile.content);
      setIsEditing(true);
      setViewMode('editor');
      if (isMobile) setMobilePanel('editor');
    }, 100);
    
    // Expand folder if created inside one
    if (folderPath) {
      setExpandedFolders(prev => new Set(prev).add(folderPath));
    }
    
    // Close create menu
    setShowCreateMenu(false);
    setShowEmptyState(false);
  }, [currentArtifacts, handleArtifactUpdate, isMobile]);

  // 🎯 SELECTED FILE STATE (for ArtifactManager)
  const [selectedFile, setSelectedFile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('editor');
  const [mobilePanel, setMobilePanel] = useState('tree');

  // 🎯 CREATE NEW FOLDER FUNCTION
  const handleCreateNewFolder = useCallback((parentPath = '') => {
    if (!newFolderName.trim()) {
      setCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    
    const sanitizedName = newFolderName.trim().replace(/[<>:"/\\|?*]/g, '');
    const folderPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;
    
    // Create a dummy file inside the folder to represent it in the tree
    const dummyFile = {
      path: `${folderPath}/.keep`,
      content: '# Folder placeholder',
      language: 'text',
      id: generateSafeId(folderPath),
      name: '.keep',
      fullPath: `${folderPath}/.keep`,
      type: 'file',
      createdBy: 'user',
      isFolderPlaceholder: true
    };
    
    const updatedArtifacts = [...currentArtifacts, dummyFile];
    handleArtifactUpdate(updatedArtifacts);
    
    // Expand the parent folder
    if (parentPath) {
      setExpandedFolders(prev => new Set(prev).add(parentPath));
    }
    
    // Reset state
    setCreatingFolder(false);
    setNewFolderName('');
    setShowCreateMenu(false);
    setShowEmptyState(false);
  }, [currentArtifacts, handleArtifactUpdate, newFolderName]);

  // 🎯 FIXED STREAMING FUNCTION - WITH AUTOMATIC ARTIFACT ADDITION
  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && !imageFile) || isLoading) return;
    if (!selectedModel) { setOllamaError("Select a model to continue."); return; }
    if (messages.length >= APP_CONFIG.LIMITS.MAX_MESSAGES) { setOllamaError("Max messages reached. Clear chat."); return; }

    if (!currentConversationId && conversations.length === 0) createNewConversation();

    // Prepare file context
    const fileContext = getFileContext();
    const combinedSystemPrompt = systemPrompt.trim() ? 
      `${DEFAULT_SYSTEM_PROMPT}\n\n${fileContext}\n\nAdditional instructions:\n${systemPrompt.trim()}` : 
      `${DEFAULT_SYSTEM_PROMPT}\n\n${fileContext}`;

    const messageId = generateSafeId('msg');
    const userMessage = { 
      role: "user", 
      content: trimmedInput, 
      id: messageId, 
      timestamp: new Date().toISOString(), 
      ...(imagePreview && { image: imagePreview }) 
    };
    const assistantMessage = { 
      role: "assistant", 
      content: "", 
      id: generateSafeId('msg'), 
      isStreaming: true, 
      timestamp: new Date().toISOString() 
    };

    // Create new messages array with both messages
    const messagesWithNew = [...messages, userMessage, assistantMessage];
    setMessages(messagesWithNew);
    setInput("");
    setOllamaError(null);
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const historyForApi = [{ role: "system", content: combinedSystemPrompt }, ...messages.slice(-20), userMessage];

    try {
      const res = await fetch(`${APP_CONFIG.OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: historyForApi.map(msg => msg.image ? { role: msg.role, content: msg.content, images: [msg.image.split(',')[1]] } : msg),
          stream: true,
          options: { temperature: 0.7, top_p: 0.9 }
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("Streaming not supported");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let fullContent = "";
      let lastUpdateTime = 0;
      const UPDATE_INTERVAL = 16; // ~60 FPS for smooth streaming

      const updateMessageContent = (content) => {
        setMessages(prev => prev.map(m => 
          m.id === assistantMessage.id ? { 
            ...m, 
            content: content,
            isStreaming: true 
          } : m
        ));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const json = JSON.parse(line);
            if (json.message?.content) { 
              fullContent += json.message.content;
              
              // Update immediately for smooth streaming
              const now = Date.now();
              if (now - lastUpdateTime > UPDATE_INTERVAL || fullContent.length % 3 === 0) {
                updateMessageContent(fullContent);
                lastUpdateTime = now;
              }
            }
          } catch {}
        }
      }

      // Final update with complete content
      updateMessageContent(fullContent);

      const parsedResponse = parseLLMResponse(fullContent);
      
      console.log("📦 [DEBUG] Parsed artifacts from AI:", parsedResponse.artifacts.length, "files");
      console.log("📦 [DEBUG] Current artifacts before:", currentArtifacts.length);
      
      // CRITICAL FIX: Process artifacts BEFORE updating the message
      if (parsedResponse.artifacts.length > 0) {
        console.log("📦 [DEBUG] Processing artifacts...");
        
        // First, create enhanced artifacts with proper structure
        const enhancedArtifacts = parsedResponse.artifacts.map(artifact => {
          // Check if this artifact already exists in current artifacts
          const isDuplicate = currentArtifacts.some(existing => 
            existing.path === artifact.path || 
            (existing.content && artifact.content && existing.content === artifact.content)
          );
          
          if (isDuplicate) {
            // Skip duplicates
            console.log(`📦 [DEBUG] Skipping duplicate artifact: ${artifact.path}`);
            return null;
          }
          
          console.log(`📦 [DEBUG] Adding new artifact: ${artifact.path}`);
          
          return {
            ...artifact,
            id: generateSafeId(`file-${artifact.path}`),
            type: 'file',
            createdBy: 'ai',
            timestamp: new Date().toISOString(),
            addedToProject: true, // Mark as added
            source: artifact.source || 'parsed'
          };
        }).filter(Boolean); // Remove null entries (duplicates)
      
        console.log("📦 [DEBUG] Enhanced artifacts to add:", enhancedArtifacts.length);
      
        // Add to current artifacts if we have any new files
        if (enhancedArtifacts.length > 0) {
          const updatedArtifacts = [...currentArtifacts, ...enhancedArtifacts];
          console.log("📦 [DEBUG] Updated artifacts total will be:", updatedArtifacts.length);
          console.log("📦 [DEBUG] First artifact:", enhancedArtifacts[0]?.path);
          
          // 🎯 CRITICAL: Call the update function
          handleArtifactUpdate(updatedArtifacts);
          
          // Auto-show artifacts panel when files are generated
          if (!showArtifacts && enhancedArtifacts.length > 0) {
            console.log("📦 [DEBUG] Auto-showing artifacts panel");
            setShowArtifacts(true);
            localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS, 'true');
          }
          
          setShowEmptyState(false);
          
          // Update the parsedResponse to mark artifacts as added
          parsedResponse.artifacts = enhancedArtifacts.map(art => ({
            ...art,
            addedToProject: true
          }));
        } else {
          // No new artifacts were added (all were duplicates)
          console.log("📦 [DEBUG] No new artifacts to add (all duplicates)");
          parsedResponse.artifacts = parsedResponse.artifacts.map(artifact => ({
            ...artifact,
            addedToProject: false,
            isDuplicate: true
          }));
        }
      }
      
      console.log("📦 [DEBUG] Current conversation ID:", currentConversationId);
      
      // Now set the final message with parsed response
      const finalMessages = messagesWithNew.map(m => 
        m.id === assistantMessage.id ? { 
          ...m, 
          content: parsedResponse.content, 
          parsedResponse: parsedResponse,
          isStreaming: false 
        } : m
      );
      
      setMessages(finalMessages);

      // Save the updated conversation
      if (currentConversationId) {
        const updatedConversations = conversations.map(conv => 
          conv.id === currentConversationId 
            ? { 
                ...conv, 
                messages: finalMessages,
                lastUpdated: new Date().toISOString(),
                title: finalMessages.length > 0 
                  ? (finalMessages[0]?.content?.substring(0, 50) + (finalMessages[0]?.content?.length > 50 ? '...' : '')) 
                  : conv.title || 'New Conversation'
            }
          : conv
        );
        
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS, JSON.stringify(updatedConversations));
        setConversations(updatedConversations);
      }
    } catch (err) {
      if (err.name === "AbortError") { 
        setMessages(prev => prev.slice(0, -1)); 
        setIsLoading(false); 
        abortControllerRef.current = null; 
        return; 
      }
      setMessages(prev => prev.map(m => 
        m.id === assistantMessage.id ? { 
          ...m, 
          content: `⚠️ Error: ${err.message}`, 
          isError: true, 
          isStreaming: false 
        } : m
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [input, isLoading, messages, selectedModel, systemPrompt, imageFile, imagePreview, currentConversationId, conversations, createNewConversation, showArtifacts, currentArtifacts, handleArtifactUpdate, getFileContext, parseLLMResponse]);

  const handleKeyDown = useCallback((e) => { 
    if (e.key === "Enter" && e.ctrlKey) { 
      e.preventDefault(); 
      sendMessage(); 
    } 
  }, [sendMessage]);
  
  const stopGeneration = useCallback(() => { 
    if (abortControllerRef.current) { 
      abortControllerRef.current.abort(); 
      abortControllerRef.current = null; 
    } 
  }, []);

  const canSend = !!((input.trim() || imageFile) && selectedModel && !isLoading && input.length <= APP_CONFIG.LIMITS.MAX_INPUT_LENGTH);

  const toggleArtifactsPanel = useCallback((e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setShowArtifacts(prev => {
      const newValue = !prev;
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS, newValue.toString());
      return newValue;
    });
    setShowEmptyState(false);
  }, []);

  const handleViewEdit = useCallback((edit) => {
    setViewingEdit(edit);
  }, []);

  const handleApplyEditFromViewer = useCallback((editId) => {
    const edit = currentEdits.find(e => e.id === editId);
    if (!edit) return;
    
    let targetFile = findTargetFileForEdit(currentArtifacts, edit.path);
    
    if (!targetFile) {
      console.error('Target file not found:', edit.path);
      alert(`Error: File "${edit.path}" not found in current project.`);
      return;
    }
    
    const { result, appliedCount, failedOps } = applySearchReplace(
      targetFile.content,
      edit.operations
    );
    
    if (appliedCount === 0) {
      alert(`⚠️ No operations were applied. Please check that the search patterns match the current file content.`);
      return;
    }
    
    const updatedArtifacts = currentArtifacts.map(art => 
      art.path === targetFile.path 
        ? { ...art, content: result }
        : art
    );
    
    handleArtifactUpdate(updatedArtifacts);
    
    if (appliedCount === edit.operations.length) {
      alert(`✅ Successfully applied all ${appliedCount} changes to ${targetFile.path}`);
    } else {
      let message = `Applied ${appliedCount} of ${edit.operations.length} changes to ${targetFile.path}.`;
      
      if (failedOps.length > 0) {
        message += `\n\n${failedOps.length} operation(s) failed:`;
        failedOps.slice(0, 3).forEach(f => {
          message += `\n• Operation ${f.index}: ${f.reason}`;
        });
        if (failedOps.length > 3) {
          message += `\n• ... and ${failedOps.length - 3} more`;
        }
      }
      
      alert(message);
    }
  }, [currentArtifacts, handleArtifactUpdate, currentEdits, findTargetFileForEdit, applySearchReplace]);

  // 🎯 RENDER FUNCTIONS
  const renderMessage = useCallback((message) => {
    const { content, role, image, parsedResponse } = message;
    const isAssistant = role === "assistant";
    
    return (
      <div className="message-content">
        {image && (
          <div className="message-image-container">
            <img src={image} alt="Attached" className="message-image" onClick={() => window.open(image, '_blank')} />
          </div>
        )}
        
        {isAssistant ? (
          <>
            {content && (
              <div className="message-text">
                <ReactMarkdown rehypePlugins={[rehypeRaw]} components={{
                  code: ({ node, inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    if (!inline && match) {
                      return (
                        <div className="code-block-wrapper">
                          <div className="code-block-header">
                            <button className="code-block-toggle">
                              <span className="code-block-language">{match[1]?.toUpperCase() || 'CODE'}</span>
                            </button>
                            <div className="code-block-actions">
                              <button 
                                onClick={() => navigator.clipboard.writeText(String(children))}
                                className="code-copy-button"
                                title="Copy code"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          </div>
                          <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" showLineNumbers={false}>
                            {String(children)}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }
                    return <code className="inline-code">{children}</code>;
                  },
                  p: ({ children, node }) => {
                    return <div className="message-paragraph">{children}</div>;
                  },
                }}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
            {parsedResponse?.instructions?.length > 0 && (
              <div className="instructions-display">
                <div className="instructions-header">
                  <Play size={16} />
                  <span>Instructions</span>
                </div>
                <div className="instructions-content">
                  {parsedResponse.instructions.slice(0, 5).map((instruction, index) => (
                    <div key={index} className="instruction-step">
                      <div className="step-number">{index + 1}</div>
                      <div className="step-content">
                        <div className="instruction-text">{instruction}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {parsedResponse?.edits?.length > 0 && (
              <div className="edits-notification">
                <div className="edits-header">
                  <Edit size={16} />
                  <span>Suggested File Changes ({parsedResponse.edits.length})</span>
                </div>
                <div className="edits-list">
                  {parsedResponse.edits.slice(0, 3).map((edit) => (
                    <div 
                      key={edit.id} 
                      className="edit-notification" 
                      onClick={() => handleViewEdit(edit)}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                    >
                      <FileText size={14} />
                      <span className="edit-file">{edit.path}</span>
                      <span className="edit-badge context">
                        {edit.operationCount} operations
                      </span>
                      <ChevronRight size={14} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {parsedResponse?.artifacts?.length > 0 && (
              <div className="artifacts-display">
                <div className="artifacts-header">
                  <div className="artifacts-title">
                    <FileText size={16} />
                    <span>Generated Files ({parsedResponse.artifacts.length})</span>
                    {parsedResponse.artifacts.some(a => a.addedToProject) && (
                      <span className="added-badge">
                        <Check size={14} />
                        {parsedResponse.artifacts.filter(a => a.addedToProject).length} added to project
                      </span>
                    )}
                  </div>
                </div>
                <div className="artifacts-list">
                  {parsedResponse.artifacts.slice(0, 5).map((artifact) => {
                    // Check if already in project
                    const isInProject = artifact.addedToProject || currentArtifacts.some(a => 
                      a.path === artifact.path || 
                      (a.content && artifact.content && a.content === artifact.content)
                    );
                    
                    return (
                      <div key={artifact.id} className={`artifact-item ${isInProject ? 'added' : ''}`}>
                        <div className="artifact-header">
                          <div className="artifact-info">
                            <div className="file-icon">
                              <FileText size={14} />
                            </div>
                            <div className="file-details">
                              <span className="file-name">{artifact.path}</span>
                              <div className="file-meta">
                                <span className="file-language">{artifact.language}</span>
                                <span className="file-size">
                                  {artifact.lineCount} lines • {formatBytes(artifact.size || artifact.content.length)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="artifact-actions">
                            {!isInProject ? (
                              <button 
                                onClick={() => {
                                  const enhancedArtifact = {
                                    ...artifact,
                                    id: generateSafeId(`file-${artifact.path}`),
                                    type: 'file',
                                    createdBy: 'ai',
                                    timestamp: new Date().toISOString(),
                                    addedToProject: true
                                  };
                                  handleArtifactUpdate([...currentArtifacts, enhancedArtifact]);
                                  setShowArtifacts(true);
                                  setShowEmptyState(false);
                                  
                                  // Update the artifact in the message to show it's added
                                  artifact.addedToProject = true;
                                  
                                  // Force re-render
                                  setTimeout(() => {
                                    setMessages(prev => prev.map(msg => 
                                      msg.id === message.id ? {
                                        ...msg,
                                        parsedResponse: {
                                          ...msg.parsedResponse,
                                          artifacts: msg.parsedResponse?.artifacts?.map(art => 
                                            art.path === artifact.path ? { ...art, addedToProject: true } : art
                                          ) || []
                                        }
                                      } : msg
                                    ));
                                  }, 50);
                                }}
                                className="add-to-project-btn"
                                title="Add to project"
                              >
                                <Plus size={14} />
                                Add
                              </button>
                            ) : (
                              <span className="added-check" title="Already in project">
                                <Check size={14} />
                                Added
                              </span>
                            )}
                            <button 
                              onClick={() => navigator.clipboard.writeText(artifact.content)}
                              className="copy-artifact-btn"
                              title="Copy code"
                            >
                              <Copy size={14} />
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {parsedResponse.artifacts.length > 5 && (
                  <div className="artifacts-footer">
                    <small>... and {parsedResponse.artifacts.length - 5} more files</small>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="user-text">{content}</div>
        )}
      </div>
    );
  }, [handleArtifactUpdate, currentArtifacts, handleViewEdit]);

  // 🎯 EMPTY ARTIFACTS PLACEHOLDER COMPONENT
  const EmptyArtifactsPlaceholder = React.memo(() => {
    return (
      <div className="empty-artifacts-placeholder">
        <div className="empty-artifacts-icon">
          <FileCode size={48} />
        </div>
        <h3>No Project Files Yet</h3>
        <p>Start by creating your first file or ask the AI to generate code</p>
        <div className="empty-actions">
          <button 
            onClick={() => handleCreateNewFile()}
            className="create-first-file-btn"
          >
            <FilePlus size={16} />
            Create First File
          </button>
          <button 
            onClick={() => {
              setInput("Create a new project with basic structure");
              textareaRef.current?.focus();
            }}
            className="ask-ai-btn"
          >
            <Bot size={16} />
            Ask AI to Start Project
          </button>
        </div>
      </div>
    );
  });

  // 🎯 CREATE MENU COMPONENT
  const CreateMenu = React.memo(({ onClose }) => {
    const menuRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          onClose();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
      <div className="create-menu" ref={menuRef}>
        <button 
          className="create-menu-item"
          onClick={() => {
            handleCreateNewFile();
            onClose();
          }}
        >
          <FilePlus size={16} />
          <span>New File</span>
        </button>
        <button 
          className="create-menu-item"
          onClick={() => {
            setCreatingFolder(true);
            onClose();
          }}
        >
          <FolderPlus size={16} />
          <span>New Folder</span>
        </button>
      </div>
    );
  });

  // 🎯 FOLDER CREATION INPUT
  const FolderCreationInput = React.memo(() => {
    const handleSubmit = (e) => {
      e.preventDefault();
      handleCreateNewFolder();
    };

    const handleCancel = () => {
      setCreatingFolder(false);
      setNewFolderName('');
    };

    return (
      <div className="folder-creation-input">
        <form onSubmit={handleSubmit}>
          <input
            ref={folderInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="folder-input"
            autoFocus
          />
          <div className="folder-input-actions">
            <button type="submit" className="folder-input-btn primary">
              Create
            </button>
            <button type="button" className="folder-input-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  });

  // 🎯 CHILD COMPONENTS
  const SystemPromptInput = React.memo(({ isVisible, onClose }) => {
    const textareaRef = useRef(null);

    const handleChange = useCallback((e) => {
      const value = e.target.value;
      if (value.length <= APP_CONFIG.LIMITS.MAX_INPUT_LENGTH) {
        setSystemPrompt(value);
        const ta = textareaRef.current;
        if (ta) { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; }
      }
    }, []);

    useEffect(() => {
      const handleEscape = (e) => { if (e.key === "Escape" && isVisible) onClose(); };
      if (isVisible) {
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
      }
    }, [isVisible, onClose]);

    if (!isVisible) return null;

    return (
      <ClickOutside active={isVisible} onClickOutside={onClose}>
        <div className="system-prompt-modal" onClick={(e) => e.stopPropagation()}>
          <div className="system-prompt-header">
            <h3>Additional System Prompt</h3>
            <button onClick={onClose} className="icon-button" aria-label="Close system prompt">×</button>
          </div>
          <div className="system-prompt-content">
            <textarea
              ref={textareaRef}
              value={systemPrompt}
              onChange={handleChange}
              placeholder="Enter additional system instructions"
              rows={3}
              className="system-prompt-textarea"
              maxLength={APP_CONFIG.LIMITS.MAX_INPUT_LENGTH}
              aria-label="System prompt input"
            />
            <div className="system-prompt-stats">{systemPrompt.length}/{APP_CONFIG.LIMITS.MAX_INPUT_LENGTH}</div>
          </div>
        </div>
      </ClickOutside>
    );
  });

  const SettingsDropdown = React.memo(() => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const closeDropdown = useCallback(() => setIsOpen(false), []);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target)) closeDropdown();
      };
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen, closeDropdown]);

    return (
      <div className="settings-dropdown" ref={dropdownRef}>
        <button className="settings-trigger icon-button" onClick={() => setIsOpen(prev => !prev)} title="Settings" aria-label="Settings">
          <Settings className="icon" />
        </button>
        
        <AnimatePresence>
          {isOpen && (
            <motion.div className="settings-menu" initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }}>
              <button onClick={() => { setShowSystemPrompt(true); closeDropdown(); }} className="settings-menu-item" aria-label="Edit system prompt">
                <Settings size={16} /><span>System Prompt</span>
              </button>
              <button onClick={() => { toggleTheme(); closeDropdown(); }} className="settings-menu-item" aria-label={`Toggle theme to ${theme === 'dark' ? 'light' : 'dark'}`}>
                {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}<span>Toggle Theme</span>
              </button>
              <div className="settings-menu-divider"></div>
              <button onClick={() => { clearChat(); closeDropdown(); }} className="settings-menu-item danger" disabled={messages.length === 0} aria-label="Clear chat">
                <Trash2 size={16} /><span>Clear Chat</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  });

  const ModelDropdown = React.memo(() => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [internalShowUnrecommended, setInternalShowUnrecommended] = useState(false);
  
    // Use a local state to avoid triggering parent re-render
    const closeDropdown = useCallback(() => { 
      setIsOpen(false); 
      setInternalShowUnrecommended(false);
    }, []);
  
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
          closeDropdown();
        }
      };
      
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen, closeDropdown]);
  
    const displayName = 
      typeof selectedModel === "string" && selectedModel
        ? selectedModel.split(":")[0]
        : "Select model";
  
    return (
      <div className="model-dropdown-wrapper" ref={dropdownRef}>
        <button
          className={`model-dropdown-trigger ${isOpen ? "open" : ""}`}
          onClick={() => {
            if (!isLoadingModels) {
              setIsOpen(prev => !prev);
            }
          }}
          disabled={isLoadingModels}
          aria-label={
            isLoadingModels ? "Loading models..." : `Select model: ${displayName}`
          }
        >
          <div className="model-trigger-content">
            <span className="model-trigger-text">
              {isLoadingModels ? "Loading..." : displayName}
            </span>
            <ChevronDown size={14} className="dropdown-chevron" />
          </div>
        </button>
  
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="model-dropdown-menu"
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {models.cloud.length > 0 && (
                <div className="model-section">
                  <div className="model-section-title">Recommended Models</div>
                  {models.cloud.slice(0, 10).map((model) => (
                    <button
                      key={`model-cloud-${model}`}
                      className={`model-menu-item ${
                        selectedModel === model ? "selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedModel(model);
                        saveSelectedModel(model);
                        setIsOpen(false);
                        setInternalShowUnrecommended(false);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <span className="model-item-text">{model}</span>
                      {selectedModel === model && (
                        <Check size={14} className="model-check" />
                      )}
                    </button>
                  ))}
                </div>
              )}
  
              {models.nonCloud.length > 0 && (
                <div className="model-section">
                  <button
                    className="model-menu-group"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setInternalShowUnrecommended((prev) => !prev);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span>Other Models</span>
                    <span className="group-arrow">
                      {internalShowUnrecommended ? "−" : "+"}
                    </span>
                  </button>
  
                  {internalShowUnrecommended &&
                    models.nonCloud.slice(0, 10).map((model) => (
                      <button
                        key={`model-noncloud-${model}`}
                        className={`model-menu-item model-menu-item-unrecommended ${
                          selectedModel === model ? "selected" : ""
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedModel(model);
                          saveSelectedModel(model);
                          setIsOpen(false);
                          setInternalShowUnrecommended(false);
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <span className="model-item-text">{model}</span>
                        {selectedModel === model && (
                          <Check size={14} className="model-check" />
                        )}
                      </button>
                    ))}
                </div>
              )}
  
              {models.cloud.length === 0 && models.nonCloud.length === 0 && (
                <div className="model-empty-state">
                  <div className="model-empty-icon">🤖</div>
                  <div className="model-empty-text">No models available</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  });

  // 🎯 REMOVED: StorageManagement component (backup functionality)

  const SidePanel = React.memo(() => {
    const formatPreview = useCallback((messages) => {
      if (!messages || messages.length === 0) return 'No messages yet';
      const lastMessage = messages[messages.length - 1];
      return (lastMessage.content || '').substring(0, 50) + ((lastMessage.content?.length || 0) > 50 ? '...' : '');
    }, []);

    const formatDateShort = useCallback((timestamp) => {
      const date = new Date(timestamp);
      const now = new Date();
      const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }, []);

    useEffect(() => {
      const handleEscape = (e) => { if (e.key === 'Escape' && showSidePanel) setShowSidePanel(false); };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [showSidePanel]);

    return (
      <>
        <div className={`side-panel-overlay ${showSidePanel ? 'active' : ''}`} onClick={() => setShowSidePanel(false)} />
        <div className={`side-panel ${showSidePanel ? 'active' : ''}`}>
          <div className="side-panel-header">
            <h2 className="side-panel-title">Chat History</h2>
            <button onClick={() => setShowSidePanel(false)} className="side-panel-close" aria-label="Close side panel">×</button>
          </div>

          <div className="side-panel-content">
            <div className="side-panel-section">
              <h3 className="side-panel-section-title">Current Model</h3>
              <div className="model-info-card">
                <div className="model-info-header">
                  <h4 className="model-info-name">{selectedModel || 'No model selected'}</h4>
                  <span className="model-info-tag">Active</span>
                </div>
                <div className="model-info-details">
                  <div className="model-info-detail">
                    <span className="model-info-label">Prompt</span>
                    <span className="model-info-value">{systemPrompt ? 'Custom' : 'Default'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="side-panel-section conversation-section">
              <div className="section-header">
                <h3 className="section-title">Conversations</h3>
                <button onClick={createNewConversation} className="new-convo-button" title="New Conversation" aria-label="New conversation">
                  <Plus size={16} />
                </button>
              </div>
              
              <div className="conversation-list">
                {conversations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">💬</div>
                    <p className="empty-state-text">No conversations yet</p>
                  </div>
                ) : (
                  conversations.slice(0, 20).map((conv) => {
                    // Generate a title from messages if not set
                    const conversationTitle = conv.title || 
                      (conv.messages?.length > 0 
                        ? (conv.messages[0]?.content?.substring(0, 50) + (conv.messages[0]?.content?.length > 50 ? '...' : ''))
                        : 'New Conversation');
                    
                    return (
                      <div key={`conversation-${conv.id}`} className={`conversation-item ${conv.active ? 'active' : ''}`} onClick={() => selectConversation(conv)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && selectConversation(conv)}>
                        <div className="conversation-icon"><History size={14} /></div>
                        <div className="conversation-content">
                          <div className="conversation-title">{conversationTitle}</div>
                          <div className="conversation-preview">{formatPreview(conv.messages)}</div>
                          <div className="conversation-date">{formatDateShort(conv.lastUpdated)}</div>
                        </div>
                        <div className="conversation-actions">
                          <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} className="conversation-delete" title="Delete" aria-label={`Delete conversation ${conv.title}`}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="data-management-section">
              <div className="panel-actions">
                <button onClick={exportConversations} className="panel-button" aria-label="Export conversations"><Download size={16} />Export</button>
                <button onClick={importConversations} className="panel-button" aria-label="Import conversations"><Upload size={16} />Import</button>
                {conversations.length > 0 && (
                  <button onClick={clearAllConversations} className="panel-button danger" aria-label="Clear all conversations"><Trash2 size={16} />Clear All</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  });

  const DiffViewerPage = React.memo(({ edit, onClose }) => {
    const [applying, setApplying] = useState(false);
    const [previewResult, setPreviewResult] = useState(null);
    
    const file = useMemo(() => 
      findTargetFileForEdit(currentArtifacts, edit.path) || { content: '', path: edit.path, language: getLanguageFromPath(edit.path) },
      [currentArtifacts, edit.path]
    );

    useEffect(() => {
      if (edit.operations && file.content) {
        const { result, appliedCount, failedOps } = applySearchReplace(file.content, edit.operations);
        setPreviewResult({ result, appliedCount, failedOps });
      }
    }, [edit.operations, file.content]);

    const handleApply = useCallback(async () => {
      setApplying(true);
      try {
        handleApplyEditFromViewer(edit.id);
        setTimeout(() => {
          onClose();
        }, 500);
      } catch (error) {
        console.error('Error applying edit:', error);
        alert('Error applying changes. Check console for details.');
        setApplying(false);
      }
    }, [edit, handleApplyEditFromViewer, onClose]);

    return (
      <div className="diff-viewer-page">
        <div className="diff-viewer-overlay" onClick={onClose}></div>
        <div className="diff-viewer-content">
          <div className="diff-viewer-header">
            <div className="diff-viewer-title-section">
              <button onClick={onClose} className="diff-viewer-back" aria-label="Go back">
                <ChevronLeft size={20} />
              </button>
              <div className="diff-viewer-file-info">
                <FileCode size={20} />
                <div>
                  <h2 className="diff-viewer-filename">{edit.path}</h2>
                  <p className="diff-viewer-stats">
                    {edit.operations?.length || 0} search/replace operations
                    {previewResult && ` • ${previewResult.appliedCount}/${edit.operations.length} will apply`}
                  </p>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="diff-viewer-close" aria-label="Close diff viewer">
              <X size={20} />
            </button>
          </div>

          {previewResult && previewResult.failedOps.length > 0 && (
            <div className="diff-viewer-warning">
              <Shield size={16} />
              <div className="warning-text">
                <strong>Warning:</strong> {previewResult.failedOps.length} operation(s) could not find an exact match.
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  <details>
                    <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Show debug information</summary>
                    <div style={{ marginTop: '8px', fontFamily: 'monospace' }}>
                      {previewResult.failedOps.map((op, idx) => (
                        <div key={idx} style={{ marginBottom: '12px', padding: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px' }}>
                          <div><strong>Operation {op.index}:</strong></div>
                          <div style={{ color: 'var(--text-secondary)' }}>{op.reason}</div>
                          {op.debug && (
                            <>
                              <div style={{ marginTop: '4px' }}>
                                <div><small>Search pattern:</small></div>
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px' }}>
                                  {JSON.stringify(op.search)}
                                </pre>
                              </div>
                              <div style={{ marginTop: '4px' }}>
                                <div><small>File content start:</small></div>
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px' }}>
                                  {op.debug.originalFirst50}
                                </pre>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {edit.operations?.length > 0 && (
            <div className="context-operations">
              <div className="operations-header">
                <Code2 size={16} />
                <span>Search & Replace Operations</span>
              </div>
              <div className="operations-list">
                {edit.operations.slice(0, 10).map((op, idx) => {
                  const willFail = previewResult?.failedOps.some(f => f.index === idx + 1);
                  return (
                    <div key={`operation-${idx}`} className={`operation-item ${willFail ? 'operation-failed' : ''}`}>
                      <div className="operation-label search">SEARCH {willFail && '(NO MATCH)'}</div>
                      <div className="operation-content">
                        <pre className="operation-code">{op.search}</pre>
                      </div>
                      <div className="operation-label replace">REPLACE</div>
                      <div className="operation-content">
                        <pre className="operation-code">{op.replace}</pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="diff-viewer-footer">
            <button onClick={onClose} className="diff-viewer-btn secondary" disabled={applying}>
              <X size={16} />
              Cancel
            </button>
            <button 
              onClick={handleApply} 
              className="diff-viewer-btn primary"
              disabled={applying || (previewResult && previewResult.appliedCount === 0)}
              aria-label="Apply changes"
              title={previewResult && previewResult.appliedCount === 0 ? 'No operations will apply' : ''}
            >
              {applying ? (
                <>Applying...</>
              ) : (
                <>
                  <Check size={16} />
                  Apply {previewResult && previewResult.appliedCount > 0 ? `(${previewResult.appliedCount})` : ''} Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  });

  const ArtifactManager = React.memo(({ isMobile, currentConversationId }) => {
    const debouncedSearchTerm = useDebounce(searchTerm, APP_CONFIG.TIMEOUTS.DEBOUNCE_DELAY);
  
    // 🎯 FIX: Add a key to force re-render when artifacts change
    const artifactKey = useMemo(() => 
      `artifacts-${currentArtifacts.length}`,
      [currentArtifacts.length]
    );
  
    console.log("📁 [DEBUG] ArtifactManager rendering with:", currentArtifacts.length, "artifacts");
    console.log("📁 [DEBUG] Current conversation ID:", currentConversationId);
  
    const toggleFolder = useCallback((folderPath, e) => {
      if (e) e.stopPropagation();
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderPath)) newSet.delete(folderPath);
        else newSet.add(folderPath);
        return newSet;
      });
    }, []);
  
    const handleFileSelect = useCallback((file, e) => {
      if (e) e.stopPropagation();
      console.log("📁 [DEBUG] File selected:", file.path);
      setSelectedFile(file);
      setEditedContent(file.content);
      setIsEditing(false);
      setViewMode('editor');
      if (isMobile) setMobilePanel('editor');
      setShowEmptyState(false);
    }, [isMobile]);
  
    const handleSave = useCallback(() => {
      if (selectedFile) {
        console.log("📁 [DEBUG] Saving file:", selectedFile.path);
        const updatedArtifacts = currentArtifacts.map(art => 
          art.path === selectedFile.path ? { ...art, content: editedContent } : art
        );
        handleArtifactUpdate(updatedArtifacts);
        setIsEditing(false);
        setShowEmptyState(false);
      }
    }, [selectedFile, editedContent, currentArtifacts, handleArtifactUpdate]);
  
    const handleCancelEdit = useCallback(() => {
      if (selectedFile) setEditedContent(selectedFile.content);
      setIsEditing(false);
    }, [selectedFile]);
  
    const handleDelete = useCallback((filePath, e) => {
      if (e) e.stopPropagation();
      if (!confirm(`Are you sure you want to delete "${filePath}"?\n\nThis will remove the file from your project and cannot be undone.`)) return;
      
      console.log("📁 [DEBUG] Deleting file:", filePath);
      const updatedArtifacts = currentArtifacts.filter(art => art.path !== filePath);
      handleArtifactUpdate(updatedArtifacts);
      
      if (selectedFile?.path === filePath) {
        setSelectedFile(null);
        setEditedContent('');
        if (isMobile) setMobilePanel('tree');
      }
      
      if (updatedArtifacts.length === 0) {
        setShowEmptyState(true);
      }
    }, [currentArtifacts, selectedFile, handleArtifactUpdate, isMobile]);
  
    const fileTree = useMemo(() => {
      console.log("📁 [DEBUG] Building file tree from:", currentArtifacts.length, "artifacts");
      
      const tree = {};
      
      const limitedArtifacts = currentArtifacts.slice(0, 100);
      
      limitedArtifacts.forEach(file => {
        console.log("📁 [DEBUG] Processing file for tree:", file.path);
        const pathParts = file.path.split('/');
        let currentLevel = tree;
        
        pathParts.forEach((part, index) => {
          const isFile = index === pathParts.length - 1;
          
          if (!currentLevel[part]) {
            if (isFile) {
              currentLevel[part] = { 
                ...file, 
                type: 'file', 
                name: part, 
                fullPath: file.path 
              };
            } else {
              currentLevel[part] = { 
                type: 'folder', 
                name: part, 
                children: {}, 
                fullPath: pathParts.slice(0, index + 1).join('/') 
              };
            }
          }
          
          if (!isFile) {
            currentLevel = currentLevel[part].children;
          }
        });
      });
      
      console.log("📁 [DEBUG] File tree built:", Object.keys(tree).length, "root items");
      return tree;
    }, [currentArtifacts]);
  
    const filteredFileTree = useMemo(() => {
      if (!debouncedSearchTerm) return fileTree;
  
      const filterTree = (node) => {
        const filtered = {};
        for (const key in node) {
          const item = node[key];
          const matchesSearch = item.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
          
          if (item.type === 'file' && matchesSearch) {
            filtered[key] = item;
          } else if (item.type === 'folder') {
            const filteredChildren = filterTree(item.children);
            if (Object.keys(filteredChildren).length > 0 || matchesSearch) {
              filtered[key] = { ...item, children: filteredChildren };
            }
          }
        }
        return filtered;
      };
      return filterTree(fileTree);
    }, [fileTree, debouncedSearchTerm]);
  
    const FileTreeComponent = useCallback(({ node, depth = 0 }) => {
      const items = Object.keys(node).sort((a, b) => {
        const aIsFolder = node[a].type === 'folder';
        const bIsFolder = node[b].type === 'folder';
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.localeCompare(b);
      }).slice(0, 50);
  
      console.log("📁 [DEBUG] Rendering tree component with", items.length, "items at depth", depth);
  
      return items.map((key) => {
        const item = node[key];
        if (!item) return null;
        
        const isExpanded = expandedFolders.has(item.fullPath);
        const isSelected = selectedFile?.path === item.fullPath;
  
        if (item.type === 'file') {
          return (
            <div
              key={`file-${item.fullPath}-${item.id}`}
              className={`file-tree-item file ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={(e) => handleFileSelect(item, e)}
              role="button"
              tabIndex={0}
            >
              <div className="file-icon"><FileCode size={14} /></div>
              <span className="file-name">{item.name}</span>
              <span className="file-language-badge">{item.language}</span>
            </div>
          );
        } else {
          return (
            <div key={`folder-${item.fullPath}`} className="folder-container">
              <div
                className={`file-tree-item folder ${isExpanded ? 'expanded' : ''}`}
                style={{ paddingLeft: `${depth * 16}px` }}
                onClick={(e) => toggleFolder(item.fullPath, e)}
                role="button"
                tabIndex={0}
              >
                <div className="folder-icon">
                  {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  <ChevronRight size={12} className={`folder-chevron ${isExpanded ? 'expanded' : ''}`} />
                </div>
                <span className="folder-name">{item.name}</span>
                <span className="folder-count">{Object.keys(item.children).length}</span>
              </div>
              {isExpanded && (
                <div className="folder-children">
                  <FileTreeComponent node={item.children} depth={depth + 1} />
                </div>
              )}
            </div>
          );
        }
      });
    }, [expandedFolders, selectedFile, handleFileSelect, toggleFolder]);
  
    return (
      <div key={artifactKey} className={`artifact-manager ${isMobile ? 'mobile' : ''}`}>
        {(!isMobile || mobilePanel === 'tree') && (
          <div className="file-tree-panel">
            <div className="panel-header">
              <div className="panel-title">
                <SquareStack size={16} />
                <span>Project Files</span>
                <span className="file-count">({currentArtifacts.length})</span>
              </div>
              <div className="panel-actions-wrapper" ref={createMenuRef}>
                <button 
                  onClick={() => {
                    console.log("📁 [DEBUG] Create menu clicked");
                    setShowCreateMenu(prev => !prev);
                  }} 
                  className="icon-button small primary" 
                  title="Create new"
                  aria-label="Create new file or folder"
                >
                  <Plus size={14} />
                </button>
                {showCreateMenu && (
                  <CreateMenu onClose={() => setShowCreateMenu(false)} />
                )}
                
                {/* 🎯 ADD RECOVERY BUTTON */}
                <button 
                  onClick={() => {
                    console.log("🔄 [RECOVERY] Manual recovery triggered");
                    
                    // Reload from localStorage
                    const savedArtifacts = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS);
                    if (savedArtifacts) {
                      try {
                        const parsed = JSON.parse(savedArtifacts);
                        const fixed = fixCorruptedArtifacts(parsed);
                        setArtifacts(fixed);
                        
                        // Update current artifacts if we have this conversation
                        if (currentConversationId && fixed[currentConversationId]) {
                          const message = `Recovered ${fixed[currentConversationId].length} files for current conversation`;
                          console.log("🔄 [RECOVERY]", message);
                          alert(message);
                        } else {
                          const totalFiles = Object.values(fixed).reduce((sum, arr) => sum + arr.length, 0);
                          const message = `Recovered ${Object.keys(fixed).length} conversations with ${totalFiles} total files`;
                          console.log("🔄 [RECOVERY]", message);
                          alert(message);
                        }
                      } catch (error) {
                        console.error("❌ [RECOVERY] Failed to recover:", error);
                        alert("Failed to recover artifacts: " + error.message);
                      }
                    } else {
                      console.log("🔄 [RECOVERY] No saved artifacts found");
                      alert("No saved artifacts found in localStorage");
                    }
                  }}
                  className="icon-button small warning"
                  title="Recover artifacts"
                  aria-label="Recover artifacts from storage"
                >
                  <Shield size={14} />
                </button>
                
                <button 
                  onClick={() => {
                    console.log("📁 [DEBUG] Manual refresh triggered");
                    // Force re-render
                    setArtifacts(prev => ({...prev}));
                  }}
                  className="icon-button small"
                  title="Refresh"
                  aria-label="Refresh project files"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
            
            {creatingFolder && (
              <div className="creating-folder-container">
                <FolderCreationInput />
              </div>
            )}
            
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
                aria-label="Search files"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="search-clear"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            <div className="file-tree-container">
              {currentArtifacts.length === 0 || Object.keys(filteredFileTree).length === 0 ? (
                showEmptyState && <EmptyArtifactsPlaceholder />
              ) : (
                <div className="file-tree-content">
                  <FileTreeComponent node={filteredFileTree} />
                </div>
              )}
            </div>
  
            {isMobile && selectedFile && (
              <button 
                className="mobile-view-file-btn"
                onClick={() => setMobilePanel('editor')}
                aria-label={`View ${selectedFile.name}`}
              >
                <FileCode size={16} />
                View {selectedFile.name}
              </button>
            )}
          </div>
        )}
        
        {(!isMobile || mobilePanel === 'editor') && (
          <div className="file-editor-panel">
            {isMobile && (
              <div className="mobile-editor-header">
                <button 
                  onClick={() => setMobilePanel('tree')}
                  className="mobile-back-btn"
                  aria-label="Back to files"
                >
                  <ChevronLeft size={16} />
                  Back to Files
                </button>
                <span className="mobile-file-count">{currentArtifacts.length} files</span>
              </div>
            )}
            
            {selectedFile ? (
              <div className="editor-container">
                <div className="editor-header">
                  <div className="file-info">
                    <FileCode size={16} />
                    <div className="file-details">
                      <span className="file-path">{selectedFile.path}</span>
                      <span className="file-language">{selectedFile.language}</span>
                    </div>
                  </div>
                  
                  <div className="editor-actions">
                    <button 
                      onClick={() => setViewMode(prev => prev === 'editor' ? 'preview' : 'editor')} 
                      className="icon-button small"
                      aria-label={viewMode === 'editor' ? 'Switch to preview mode' : 'Switch to edit mode'}
                    >
                      {viewMode === 'editor' ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    {isEditing ? (
                      <>
                        <button onClick={handleSave} className="icon-button small success" aria-label="Save changes">
                          <Save size={14} />
                        </button>
                        <button onClick={handleCancelEdit} className="icon-button small" aria-label="Cancel edit">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setIsEditing(true)} className="icon-button small" aria-label="Edit file">
                        <Edit size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => navigator.clipboard.writeText(selectedFile.content)} 
                      className="icon-button small"
                      aria-label="Copy file content"
                    >
                      <Copy size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(selectedFile.path, e)} 
                      className="icon-button small danger"
                      aria-label="Delete file"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => {
                        if (selectedFile) {
                          console.log("📁 [DEBUG] Manual add to project:", selectedFile.path);
                          const artifactToAdd = {
                            ...selectedFile,
                            id: generateSafeId(selectedFile.path),
                            timestamp: new Date().toISOString()
                          };
                          handleArtifactUpdate([...currentArtifacts, artifactToAdd]);
                        }
                      }}
                      className="icon-button small primary"
                      aria-label="Add to project"
                      title="Add to project"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="editor-content">
                  {viewMode === 'editor' ? (
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="code-editor"
                      spellCheck="false"
                      disabled={!isEditing}
                      aria-label="Code editor"
                    />
                  ) : (
                    <div className="code-preview">
                      <SyntaxHighlighter 
                        language={selectedFile.language} 
                        style={oneDark} 
                        showLineNumbers={true} 
                        wrapLongLines={false}
                      >
                        {selectedFile.content}
                      </SyntaxHighlighter>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-file-selected">
                <FileCode size={48} />
                <h3>No file selected</h3>
                <p>Select a file from the sidebar to view or edit its contents</p>
                <button 
                  onClick={() => handleCreateNewFile()} 
                  className="create-file-button"
                  aria-label="Create new file"
                >
                  <FilePlus size={16} />Create New File
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

  // 🎯 MAIN RENDER
  return (
    <ErrorBoundary>
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <div className="header-left">
              <button className="menu-button icon-button" onClick={() => setShowSidePanel(true)} title="Menu" aria-label="Open menu">
                <Menu className="icon" />
              </button>
              <div className="header-brand">
                <div className="header-logo"><User className="icon" /></div>
                <div className="header-title-section">
                  <div className="header-title">Ollama Chat
                  </div>
                </div>
              </div>
              <div className="header-status">
                {currentArtifacts && currentArtifacts.length > 0 && (
                  <div className="artifact-indicator">
                    <FileText size={14} />
                    <span>{currentArtifacts.length} file{currentArtifacts.length !== 1 ? 's' : ''}</span>
                    {currentEdits.length > 0 && (
                      <span className="edit-count">{currentEdits.length} edits</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="header-right">
              <div className="header-actions">
                {(currentArtifacts.length > 0 || showEmptyState) && !isMobile && (
                  <button 
                    className={`icon-button ${showArtifacts ? 'active' : ''}`} 
                    onClick={toggleArtifactsPanel} 
                    title="Project Files"
                    aria-label={showArtifacts ? "Hide project files" : "Show project files"}
                  >
                    <SquareStack className="icon" />
                  </button>
                )}
                <button 
                  onClick={() => {
                    // Force reload conversations from localStorage
                    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS);
                    if (saved) {
                      try {
                        const convos = JSON.parse(saved);
                        setConversations(convos);
                        alert(`Recovered ${convos.length} conversations`);
                      } catch (error) {
                        alert("Failed to recover conversations: " + error.message);
                      }
                    } else {
                      alert("No saved conversations found");
                    }
                  }}
                  className="icon-button"
                  title="Recover conversations"
                  aria-label="Recover conversations from storage"
                >
                  <Shield size={16} />
                </button>
                <ThemeToggle />
                <SettingsDropdown />
                <ModelDropdown />
              </div>
            </div>
          </div>
        </header>

        {ollamaError && (
          <div className="error-banner">
            <div className="error-banner-content">
              <span className="error-banner-text">{ollamaError}</span>
              <button onClick={() => fetchModels()} className="error-banner-retry">Retry</button>
            </div>
          </div>
        )}

        <SystemPromptInput 
          isVisible={showSystemPrompt} 
          onClose={() => setShowSystemPrompt(false)} 
        />

        <SidePanel />

        <div className="main-content">
          {showArtifacts && (
            <div className={`artifacts-panel ${isMobile ? 'mobile' : ''} ${showArtifacts ? 'open' : ''}`}>
              <div className="artifacts-header">
                <h3>Project Files ({currentArtifacts.length})</h3>
                <div className="artifacts-header-actions">
                  <button 
                    onClick={() => {
                      console.log("🔄 Manual refresh from header");
                      // Force state update
                      setArtifacts(prev => ({...prev}));
                    }}
                    className="icon-button small"
                    title="Refresh"
                    aria-label="Refresh project files"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={toggleArtifactsPanel} className="icon-button" aria-label="Close project files">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <ArtifactManager 
                isMobile={isMobile} 
                currentConversationId={currentConversationId}
              />
            </div>
          )}

          <div className={`content-area ${showArtifacts ? 'with-artifacts' : ''}`}>
            <main className="messages-container" ref={messagesContainerRef}>
              <div className="messages-inner">
                {messages.length === 0 ? (
                  <div className="welcome-screen">
                    <div className="welcome-icon"><Bot className="icon-large" /></div>
                    <h2 className="welcome-title">Welcome to Ollama Chat</h2>
                    <p className="welcome-subtitle">Type below to start chatting</p>
                    <div className="shortcuts-hint"><small>💡 Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to send</small></div>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.slice(-30).map((m) => (
                      <motion.div
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`message-row ${m.role === "user" ? "message-row-user" : "message-row-assistant"}`}
                      >
                        <Avatar role={m.role} />
                        <div className={`bubble ${m.role === "user" ? "bubble-user" : m.isError ? "bubble-error" : "bubble-assistant"}`}>
                          {renderMessage(m)}
                          {m.isStreaming && (
                            <div className="typing-dots-container">
                              <div className="typing-dots"><span></span><span></span><span></span></div>
                            </div>
                          )}
                          {!m.isStreaming && m.role === "assistant" && (
                            <button onClick={() => copyToClipboard(m.content, m.id)} className="copy-button" aria-label="Copy message">
                              {copied === m.id ? <Check className="icon-small" /> : <Copy className="icon-small" />}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                {isLoadingModels && <><LoadingSkeleton /><LoadingSkeleton /></>}
                <div ref={messagesEndRef} />
              </div>
            </main>
          </div>
        </div>

        <footer className="input-footer">
          <div className="input-container">
            {imagePreview && (
              <div className="image-preview-container">
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" className="image-preview-img" />
                  <button onClick={removeImage} className="image-remove-button" aria-label="Remove image"><X size={16} /></button>
                </div>
              </div>
            )}
            
            <div className={`input-wrapper ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleImageSelect(file); }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={isLoading ? "Generating..." : "Send a message... (Ctrl+Enter)"}
                className="input-textarea"
                disabled={isLoading}
                maxLength={APP_CONFIG.LIMITS.MAX_INPUT_LENGTH}
                aria-label="Message input"
              />
              <div className="input-actions">
                <button onClick={() => fileInputRef.current?.click()} className="image-upload-button" disabled={isLoading} title="Attach image" aria-label="Attach image">
                  <ImageIcon className="icon" />
                </button>
                <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files[0]) handleImageSelect(e.target.files[0]); }} accept="image/*" style={{ display: 'none' }} />
                <button onClick={isLoading ? stopGeneration : sendMessage} disabled={!isLoading && !canSend} className="send-button" title={isLoading ? "Stop" : "Send"} aria-label={isLoading ? "Stop generation" : "Send message"}>
                  {isLoading ? <Square className="icon" /> : <Send className="icon" />}
                </button>
              </div>
            </div>
            
            <div className="footer-stats">
              <span className="char-count">{input.length}/{APP_CONFIG.LIMITS.MAX_INPUT_LENGTH}</span>
              {imageFile && <span className="image-info">{imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)</span>}
              <span className="connection-status">
                <span className={isOnline ? "online-indicator" : "offline-indicator"}>●</span>
                Connected to Ollama
              </span>
            </div>
          </div>
        </footer>

        {isMobile && (currentArtifacts.length > 0 || showEmptyState) && (
          <button 
            className="mobile-artifact-toggle" 
            onClick={toggleArtifactsPanel} 
            aria-label={showArtifacts ? "Hide files" : `Show ${currentArtifacts.length} files`}
          >
            <SquareStack size={20} />
            {currentArtifacts.length > 0 && <span className="artifact-badge">{currentArtifacts.length}</span>}
          </button>
        )}

        {viewingEdit && (
          <DiffViewerPage
            edit={viewingEdit}
            onClose={() => setViewingEdit(null)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}