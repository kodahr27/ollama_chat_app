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
    MAX_BACKUPS: 5,
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
    BACKUP_PREFIX: 'ollama-backup-',
    MIGRATION_VERSION: 'ollama-storage-version',
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

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const loadTimerRef = useRef(null);

  // 🎯 DERIVED STATE
  const currentArtifacts = useMemo(() => {
    return artifacts[currentConversationId] || [];
  }, [artifacts, currentConversationId]);

  // 🎯 INITIAL LOAD
  useEffect(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    
    loadTimerRef.current = setTimeout(() => {
      try {
        // Load saved messages
        const savedMessages = localStorage.getItem("ollama-chat-history");
        if (savedMessages) setMessages(JSON.parse(savedMessages));
        
        // Load saved system prompt
        const savedPrompt = localStorage.getItem("ollama-additional-system-prompt");
        if (savedPrompt) setSystemPrompt(savedPrompt);
        
        // Load saved conversations
        const savedConversations = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CONVERSATIONS);
        if (savedConversations) {
          const convos = JSON.parse(savedConversations);
          setConversations(convos);
          
          // Find the active conversation and set it as current
          const activeConvo = convos.find(c => c.active);
          if (activeConvo) {
            setCurrentConversationId(activeConvo.id);
          }
        }
        
        // Load saved artifacts
        const savedArtifacts = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS);
        if (savedArtifacts) setArtifacts(JSON.parse(savedArtifacts));
        
        // Load saved showArtifacts preference
        const savedShowArtifacts = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS);
        if (savedShowArtifacts) setShowArtifacts(savedShowArtifacts === 'true');
        
        // Load saved selected model
        const savedModel = localStorage.getItem("ollama-selected-model");
        if (savedModel) setSelectedModel(savedModel);
        
        setInitialLoadComplete(true);
      } catch (error) {
        console.error("Initial load error:", error);
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
  
  // 🎯 PARSE SEARCH/REPLACE
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
    
    // Sort operations to apply them from the end to beginning
    // This prevents issues when earlier replacements affect later search patterns
    const sortedOperations = [...limitedOperations].map((op, index) => ({
      ...op,
      originalIndex: index
    }));
    
    // Apply operations in reverse order to maintain string indices
    for (let i = sortedOperations.length - 1; i >= 0; i--) {
      const op = sortedOperations[i];
      const { search, replace } = op;
      
      // Find the last occurrence to apply from the end
      const lastIndex = result.lastIndexOf(search);
      if (lastIndex !== -1) {
        result = result.substring(0, lastIndex) + 
                 replace + 
                 result.substring(lastIndex + search.length);
        appliedCount++;
      } else {
        failedOps.push({ 
          index: op.originalIndex + 1, 
          search: search.substring(0, 100) + (search.length > 100 ? '...' : ''),
          reason: 'No exact match found.',
          debug: {
            searchLength: search.length,
            originalFirst50: originalContent.substring(0, 50),
            resultFirst50: result.substring(0, 50)
          }
        });
      }
    }
    
    return { result, appliedCount, failedOps };
  }, []);

  // 🎯 STORAGE MANAGER
  const saveArtifacts = useCallback((newArtifacts) => {
    try {
      const dataSize = new Blob([JSON.stringify(newArtifacts)]).size;
      if (dataSize > APP_CONFIG.LIMITS.MAX_STORAGE_BYTES * 0.9) {
        console.warn('Storage approaching limit');
      }
      
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ARTIFACTS, JSON.stringify(newArtifacts));
      
      setTimeout(() => {
        try {
          const backupKey = `${APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX}${Date.now()}`;
          localStorage.setItem(backupKey, JSON.stringify(newArtifacts));
          
          const backupKeys = Object.keys(localStorage)
            .filter(key => key.startsWith(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX))
            .sort()
            .reverse();
          
          if (backupKeys.length > APP_CONFIG.LIMITS.MAX_BACKUPS) {
            backupKeys.slice(APP_CONFIG.LIMITS.MAX_BACKUPS).forEach(key => {
              localStorage.removeItem(key);
            });
          }
        } catch (e) {
          console.warn('Could not create backup:', e);
        }
      }, 100);
    } catch (error) {
      console.error('Error saving artifacts:', error);
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

  const getStorageInfo = useCallback(() => {
    try {
      const artifactsSize = new Blob([JSON.stringify(artifacts)]).size;
      const conversationsSize = new Blob([JSON.stringify(conversations)]).size;
      const totalSize = artifactsSize + conversationsSize;
      
      const conversationCount = Object.keys(artifacts).length;
      const totalFiles = Object.values(artifacts).reduce((sum, files) => sum + files.length, 0);
      
      const backupKeys = Object.keys(localStorage)
        .filter(key => key.startsWith(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX));
      const backupSize = backupKeys.reduce((sum, key) => {
        return sum + (localStorage.getItem(key)?.length || 0);
      }, 0);
      
      return {
        totalSize,
        artifactsSize,
        conversationsSize,
        backupSize,
        conversationCount,
        totalFiles,
        backupCount: backupKeys.length,
        storageUsage: (totalSize / APP_CONFIG.LIMITS.MAX_STORAGE_BYTES) * 100,
        isNearLimit: totalSize > APP_CONFIG.LIMITS.MAX_STORAGE_BYTES * 0.8
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        totalSize: 0,
        artifactsSize: 0,
        conversationsSize: 0,
        backupSize: 0,
        conversationCount: 0,
        totalFiles: 0,
        backupCount: 0,
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
            type: 'artifact',
            timestamp: new Date().toISOString(),
            source: 'parsed'
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
  
      return {
        content: regularContent,
        artifacts: artifacts.slice(0, 10),
        edits: edits.slice(0, 5)
      };
    } catch (error) {
      console.error('Error parsing LLM response:', error);
      return { content: message, artifacts: [], edits: [] };
    }
  }, [parseSearchReplace]);

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
    const updatedArtifacts = { ...artifacts, [currentConversationId]: newArtifacts };
    setArtifacts(updatedArtifacts);
    
    setTimeout(() => {
      saveArtifacts(updatedArtifacts);
    }, 50);
  }, [artifacts, currentConversationId, saveArtifacts]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem("ollama-chat-history", JSON.stringify(messages));
        } catch (error) {
          console.error('Error saving messages:', error);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [messages, initialLoadComplete]);

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

  useEffect(() => {
    if (!initialLoadComplete || !currentConversationId || messages.length === 0) return;
    
    setConversations(prev => 
      prev.map(conv => 
        conv.id === currentConversationId 
          ? { ...conv, messages, lastUpdated: new Date().toISOString(), title: messages.find(m => m.role === 'user')?.content.substring(0, 30) + '...' || conv.title }
          : conv
      )
    );
  }, [messages, currentConversationId, initialLoadComplete]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, []);

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
    const newConversation = {
      id: generateSafeId('conv'),
      title: 'New Conversation',
      messages: [],
      lastUpdated: new Date().toISOString(),
      active: true
    };
    
    setConversations(prev => [newConversation, ...prev.map(conv => ({ ...conv, active: false }))]);
    setCurrentConversationId(newConversation.id);
    setMessages([]);
    setImageFile(null);
    setImagePreview(null);
    setShowSidePanel(false);
    setShowArtifacts(false);
  }, []);

  const selectConversation = useCallback((conversation) => {
    setConversations(prev => prev.map(conv => ({ 
      ...conv, 
      active: conv.id === conversation.id 
    })));
    setCurrentConversationId(conversation.id);
    setMessages(conversation.messages || []);
    setImageFile(null);
    setImagePreview(null);
    setShowSidePanel(false);
    
    if (conversation.messages && conversation.messages.length > 0) {
      const hasArtifacts = artifacts[conversation.id] && artifacts[conversation.id].length > 0;
      if (hasArtifacts) {
        const savedPreference = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SHOW_ARTIFACTS);
        const shouldShow = savedPreference === null ? true : savedPreference === 'true';
        setShowArtifacts(shouldShow);
      } else {
        setShowArtifacts(false);
      }
    }
  }, [artifacts]);

  const deleteConversation = useCallback((conversationId) => {
    if (!confirm("Delete this conversation?")) return;
    
    const isDeletingCurrent = currentConversationId === conversationId;
    
    if (isDeletingCurrent) {
      setMessages([]);
      setImageFile(null);
      setImagePreview(null);
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
    
    setConversations([]);
    setMessages([]);
    setCurrentConversationId(null);
    setImageFile(null);
    setImagePreview(null);
    
    setArtifacts({});
    saveArtifacts({});
    
    const newConversation = {
      id: generateSafeId('conv'),
      title: 'New Conversation',
      messages: [],
      lastUpdated: new Date().toISOString(),
      active: true
    };
    
    setConversations([newConversation]);
    setCurrentConversationId(newConversation.id);
    setShowSidePanel(false);
    setShowArtifacts(false);
  }, [saveArtifacts]);

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

  // 🎯 FIXED STREAMING FUNCTION
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

    setMessages(prev => [...prev, userMessage, assistantMessage]);
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
      if (parsedResponse.artifacts.length > 0) {
        handleArtifactUpdate([...currentArtifacts, ...parsedResponse.artifacts]);
        if (!showArtifacts && parsedResponse.artifacts.length > 0) setShowArtifacts(true);
      }

      setMessages(prev => prev.map(m => 
        m.id === assistantMessage.id ? { 
          ...m, 
          content: parsedResponse.content, 
          parsedResponse, 
          isStreaming: false 
        } : m
      ));
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
                  </div>
                </div>
                <div className="artifacts-list">
                  {parsedResponse.artifacts.slice(0, 3).map((artifact) => (
                    <div key={artifact.id} className="artifact-item">
                      <div className="artifact-header">
                        <div className="artifact-info">
                          <div className="file-icon"><FileText size={14} /></div>
                          <div className="file-details">
                            <span className="file-name">{artifact.path}</span>
                            <span className="file-language">{artifact.language}</span>
                          </div>
                        </div>
                        <div className="artifact-actions">
                          <button 
                            onClick={() => handleArtifactUpdate([...currentArtifacts, artifact])}
                            className="add-to-project-btn"
                            title="Add to project"
                          >
                            <Plus size={14} />
                          </button>
                          <button 
                            onClick={() => navigator.clipboard.writeText(artifact.content)}
                            className="copy-artifact-btn"
                            title="Copy code"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="user-text">{content}</div>
        )}
      </div>
    );
  }, [handleArtifactUpdate, currentArtifacts, handleViewEdit]);

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
              <button onClick={() => { setShowStorageManagement(true); closeDropdown(); }} className="settings-menu-item" aria-label="Storage management">
                <HardDrive size={16} /><span>Storage Management</span>
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

    const closeDropdown = useCallback(() => { setIsOpen(false); setShowUnrecommended(false); }, [setShowUnrecommended]);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target)) closeDropdown();
      };
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen, closeDropdown]);

    // safely derive display name
    const displayName =
      typeof selectedModel === "string" && selectedModel
        ? selectedModel.split(":")[0]
        : "Select model";
    
    return (
      <div className="model-dropdown-wrapper" ref={dropdownRef}>
        <button
          className={`model-dropdown-trigger ${isOpen ? "open" : ""}`}
          onClick={() => {
            // just open/close; don't touch model here
            if (!isLoadingModels) setIsOpen(prev => !prev);
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
                        setSelectedModel(model);      // model is a string
                        saveSelectedModel(model);     // persist as string
                        closeDropdown();
                      }}
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
                      e.stopPropagation();
                      setShowUnrecommended((prev) => !prev);
                    }}
                  >
                    <span>Other Models</span>
                    <span className="group-arrow">
                      {showUnrecommended ? "−" : "+"}
                    </span>
                  </button>
    
                  {showUnrecommended &&
                    models.nonCloud.slice(0, 10).map((model) => (
                      <button
                        key={`model-noncloud-${model}`}
                        className={`model-menu-item model-menu-item-unrecommended ${
                          selectedModel === model ? "selected" : ""
                        }`}
                        onClick={() => {
                          setSelectedModel(model);    // model is a string
                          saveSelectedModel(model);   // persist as string
                          closeDropdown();
                        }}
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

  const StorageManagement = React.memo(() => {
    const [storageInfo, setStorageInfo] = useState(null);
    const [backups, setBackups] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
      if (showStorageManagement) {
        const timer = setTimeout(() => {
          setStorageInfo(getStorageInfo());
          
          try {
            const backupKeys = Object.keys(localStorage)
              .filter(key => key.startsWith(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX))
              .sort()
              .reverse()
              .slice(0, 20);
            
            const backupList = backupKeys.map(key => {
              const data = localStorage.getItem(key);
              let artifactCount = 0;
              let totalSize = 0;
              let conversationCount = 0;
              
              try {
                const parsed = JSON.parse(data);
                conversationCount = Object.keys(parsed).length;
                artifactCount = Object.values(parsed).reduce((sum, files) => sum + files.length, 0);
                totalSize = new Blob([data]).size;
              } catch (e) {
                console.warn('Invalid backup data:', key);
              }
              
              return {
                key,
                timestamp: parseInt(key.replace(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX, '')),
                artifactCount,
                conversationCount,
                totalSize,
                date: new Date(parseInt(key.replace(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX, '')))
              };
            });
            
            setBackups(backupList);
          } catch (error) {
            console.error('Error loading backups:', error);
            setBackups([]);
          }
        }, 50);
        
        return () => clearTimeout(timer);
      }
    }, [showStorageManagement, getStorageInfo]);

    const handleExportCurrent = useCallback(() => {
      if (currentConversationId) {
        const conversationArtifacts = currentArtifacts;
        
        const exportData = {
          version: '2.0',
          type: 'ollama-project',
          exportedAt: new Date().toISOString(),
          conversationId: currentConversationId,
          artifacts: conversationArtifacts,
          fileCount: conversationArtifacts.length,
          totalSize: JSON.stringify(conversationArtifacts).length,
          metadata: {
            app: 'Ollama Chat',
            version: '2.0'
          }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ollama-project-${currentConversationId}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, [currentConversationId, currentArtifacts]);

    const handleImportToCurrent = useCallback((file) => {
      if (currentConversationId) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            
            if (!imported.artifacts || !Array.isArray(imported.artifacts)) {
              alert('Invalid project file: missing artifacts array');
              return;
            }
            
            if (imported.type !== 'ollama-project') {
              alert('Invalid file format: not an Ollama project export');
              return;
            }
            
            handleArtifactUpdate(imported.artifacts);
            alert('Project imported successfully!');
            setShowStorageManagement(false);
          } catch (error) {
            alert('Import failed: ' + error.message);
          }
        };
        reader.onerror = () => alert('Failed to read file');
        reader.readAsText(file);
      }
    }, [currentConversationId, handleArtifactUpdate]);

    const handleRestoreBackup = useCallback(async (backupKey) => {
      setRestoring(true);
      try {
        const backupData = localStorage.getItem(backupKey);
        if (!backupData) {
          throw new Error('Backup not found');
        }
        
        const importedArtifacts = JSON.parse(backupData);
        setArtifacts(importedArtifacts);
        saveArtifacts(importedArtifacts);
        
        setStorageInfo(getStorageInfo());
        setBackups(prev => prev.map(b => ({ ...b })));
        alert('Backup restored successfully!');
      } catch (error) {
        alert('Restore failed: ' + error.message);
      } finally {
        setRestoring(false);
      }
    }, [saveArtifacts]);

    const handleDeleteBackup = useCallback((backupKey) => {
      if (!confirm('Are you sure you want to delete this backup? This action cannot be undone.')) return;
      
      try {
        localStorage.removeItem(backupKey);
        setBackups(prev => prev.filter(b => b.key !== backupKey));
        setStorageInfo(getStorageInfo());
      } catch (error) {
        alert('Failed to delete backup: ' + error.message);
      }
    }, [getStorageInfo]);

    const handleCleanupBackups = useCallback(() => {
      try {
        const backupKeys = Object.keys(localStorage)
          .filter(key => key.startsWith(APP_CONFIG.STORAGE_KEYS.BACKUP_PREFIX))
          .sort()
          .reverse();
        
        if (backupKeys.length > APP_CONFIG.LIMITS.MAX_BACKUPS) {
          backupKeys.slice(APP_CONFIG.LIMITS.MAX_BACKUPS).forEach(key => {
            localStorage.removeItem(key);
          });
        }
        
        setBackups(prev => prev.slice(0, APP_CONFIG.LIMITS.MAX_BACKUPS));
        setStorageInfo(getStorageInfo());
      } catch (error) {
        console.warn('Error cleaning up backups:', error);
      }
    }, [getStorageInfo]);

    if (!showStorageManagement) return null;

    return (
      <div className="storage-management-modal">
        <div className="modal-overlay" onClick={() => setShowStorageManagement(false)}></div>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Storage Management</h2>
            <button onClick={() => setShowStorageManagement(false)} className="modal-close" aria-label="Close storage management">
              <X size={20} />
            </button>
          </div>

          <div className="storage-tabs">
            <button 
              className={`storage-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <HardDrive size={16} />
              Overview
            </button>
            <button 
              className={`storage-tab ${activeTab === 'backups' ? 'active' : ''}`}
              onClick={() => setActiveTab('backups')}
            >
              <Clock size={16} />
              Backups ({backups.length})
            </button>
          </div>

          <div className="storage-content">
            {activeTab === 'overview' && (
              <>
                {storageInfo && (
                  <div className="storage-stats">
                    <div className="stat-item">
                      <HardDrive size={16} />
                      <div className="stat-info">
                        <span className="stat-label">Total Storage Used</span>
                        <span className="stat-value">{formatBytes(storageInfo.totalSize)}</span>
                        <div className="storage-bar">
                          <div 
                            className={`storage-progress ${storageInfo.isNearLimit ? 'near-limit' : ''}`}
                            style={{ width: `${Math.min(storageInfo.storageUsage, 100)}%` }}
                          ></div>
                        </div>
                        <div className="storage-breakdown">
                          <span className="breakdown-item">Artifacts: {formatBytes(storageInfo.artifactsSize)}</span>
                          <span className="breakdown-item">Conversations: {formatBytes(storageInfo.conversationsSize)}</span>
                          <span className="breakdown-item">Backups: {formatBytes(storageInfo.backupSize)}</span>
                        </div>
                        <span className="stat-percentage">{storageInfo.storageUsage.toFixed(1)}% of limit</span>
                      </div>
                    </div>

                    <div className="stats-grid">
                      <div className="stat-card">
                        <FileText size={16} />
                        <div className="stat-card-content">
                          <span className="stat-card-value">{storageInfo.conversationCount}</span>
                          <span className="stat-card-label">Projects</span>
                        </div>
                      </div>
                      <div className="stat-card">
                        <Archive size={16} />
                        <div className="stat-card-content">
                          <span className="stat-card-value">{storageInfo.totalFiles}</span>
                          <span className="stat-card-label">Files</span>
                        </div>
                      </div>
                      <div className="stat-card">
                        <Shield size={16} />
                        <div className="stat-card-content">
                          <span className="stat-card-value">{storageInfo.backupCount}</span>
                          <span className="stat-card-label">Backups</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="storage-actions">
                  <div className="action-section">
                    <h3>Current Project</h3>
                    <div className="action-buttons">
                      <button 
                        onClick={handleExportCurrent} 
                        className="action-button primary"
                        disabled={!currentConversationId}
                      >
                        <Download size={16} />
                        Export Current Project
                      </button>
                      <label className="action-button secondary">
                        <Upload size={16} />
                        Import to Current Project
                        <input 
                          type="file" 
                          accept=".json" 
                          onChange={(e) => e.target.files[0] && handleImportToCurrent(e.target.files[0])}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="action-section">
                    <h3>Storage Maintenance</h3>
                    <div className="action-buttons">
                      <button 
                        onClick={handleCleanupBackups} 
                        className="action-button"
                      >
                        <Trash2 size={16} />
                        Clean Up Old Backups
                      </button>
                      <button 
                        onClick={() => {
                          const compressed = Object.keys(artifacts).reduce((acc, key) => {
                            if (artifacts[key] && artifacts[key].length > 0) {
                              acc[key] = artifacts[key]
                                .filter(artifact => artifact.content && artifact.content.trim())
                                .map(artifact => ({
                                  ...artifact,
                                  content: artifact.content.length > 10000 ? 
                                    artifact.content.substring(0, 10000) + '\n// ... (truncated due to size)' : 
                                    artifact.content
                                }));
                            }
                            return acc;
                          }, {});
                          saveArtifacts(compressed);
                          setStorageInfo(getStorageInfo());
                        }} 
                        className="action-button"
                      >
                        <Archive size={16} />
                        Compress Storage
                      </button>
                    </div>
                  </div>
                </div>

                {storageInfo?.isNearLimit && (
                  <div className="storage-warning">
                    <Shield size={16} />
                    <div className="warning-content">
                      <strong>Storage nearing limit ({storageInfo.storageUsage.toFixed(1)}%)</strong>
                      <p>Consider exporting older projects to free up space.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'backups' && (
              <div className="backups-section">
                <div className="backups-header">
                  <h3>Available Backups</h3>
                  <button 
                    onClick={handleCleanupBackups}
                    className="cleanup-backups-btn"
                    disabled={backups.length <= 1}
                  >
                    <Trash2 size={14} />
                    Keep Latest Only
                  </button>
                </div>
                
                {backups.length === 0 ? (
                  <div className="empty-backups">
                    <Clock size={32} />
                    <p>No backups available</p>
                    <small>Backups are created automatically when you save changes</small>
                  </div>
                ) : (
                  <div className="backups-list">
                    {backups.map((backup, index) => (
                      <div key={`backup-${backup.key}`} className="backup-item">
                        <div className="backup-info">
                          <div className="backup-header">
                            <span className="backup-date">{formatDate(backup.date)}</span>
                            {index === 0 && <span className="backup-latest-tag">Latest</span>}
                          </div>
                          <div className="backup-details">
                            <span className="backup-detail">
                              <FileText size={12} />
                              {backup.artifactCount} files
                            </span>
                            <span className="backup-detail">
                              <Folder size={12} />
                              {backup.conversationCount} projects
                            </span>
                            <span className="backup-detail">
                              <HardDrive size={12} />
                              {formatBytes(backup.totalSize)}
                            </span>
                          </div>
                        </div>
                        <div className="backup-actions">
                          <button
                            onClick={() => handleRestoreBackup(backup.key)}
                            className="backup-action-btn primary"
                            disabled={restoring || index === 0}
                            title="Restore this backup"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.key)}
                            className="backup-action-btn danger"
                            disabled={backups.length <= 1}
                            title="Delete backup"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                )}
                
                <div className="backups-info">
                  <Shield size={14} />
                  <div className="backups-info-content">
                    <strong>Backup System</strong>
                    <p>Automatic backups are created when you save changes. The system keeps up to {APP_CONFIG.LIMITS.MAX_BACKUPS} backups.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

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
                  conversations.slice(0, 20).map((conv) => (
                    <div key={`conversation-${conv.id}`} className={`conversation-item ${conv.active ? 'active' : ''}`} onClick={() => selectConversation(conv)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && selectConversation(conv)}>
                      <div className="conversation-icon"><History size={14} /></div>
                      <div className="conversation-content">
                        <div className="conversation-title">{conv.title || 'New Conversation'}</div>
                        <div className="conversation-preview">{formatPreview(conv.messages)}</div>
                        <div className="conversation-date">{formatDateShort(conv.lastUpdated)}</div>
                      </div>
                      <div className="conversation-actions">
                        <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} className="conversation-delete" title="Delete" aria-label={`Delete conversation ${conv.title}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="data-management-section">
              <div className="panel-actions">
                <button onClick={() => setShowStorageManagement(true)} className="panel-button" aria-label="Storage management"><HardDrive size={16} />Storage</button>
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

  const ArtifactManager = React.memo(({ isMobile }) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, APP_CONFIG.TIMEOUTS.DEBOUNCE_DELAY);
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [viewMode, setViewMode] = useState('editor');
    const [mobilePanel, setMobilePanel] = useState('tree');

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
      setSelectedFile(file);
      setEditedContent(file.content);
      setIsEditing(false);
      setViewMode('editor');
      if (isMobile) setMobilePanel('editor');
    }, [isMobile]);

    const handleSave = useCallback(() => {
      if (selectedFile) {
        const updatedArtifacts = currentArtifacts.map(art => 
          art.path === selectedFile.path ? { ...art, content: editedContent } : art
        );
        handleArtifactUpdate(updatedArtifacts);
        setIsEditing(false);
      }
    }, [selectedFile, editedContent, currentArtifacts, handleArtifactUpdate]);

    const handleCancelEdit = useCallback(() => {
      if (selectedFile) setEditedContent(selectedFile.content);
      setIsEditing(false);
    }, [selectedFile]);

    const handleDelete = useCallback((filePath, e) => {
      if (e) e.stopPropagation();
      if (!confirm(`Are you sure you want to delete "${filePath}"?\n\nThis will remove the file from your project and cannot be undone.`)) return;
      
      const updatedArtifacts = currentArtifacts.filter(art => art.path !== filePath);
      handleArtifactUpdate(updatedArtifacts);
      
      if (selectedFile?.path === filePath) {
        setSelectedFile(null);
        setEditedContent('');
        if (isMobile) setMobilePanel('tree');
      }
    }, [currentArtifacts, selectedFile, handleArtifactUpdate, isMobile]);

    const handleCreateFile = useCallback((e, folderPath = '') => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      const baseName = folderPath ? `${folderPath}/` : '';
      const defaultExtensions = {
        'src/components': '.jsx',
        'src': '.js',
        'styles': '.css',
        'utils': '.js',
        '': '.txt'
      };
      
      let extension = '.txt';
      for (const [path, ext] of Object.entries(defaultExtensions)) {
        if (folderPath.includes(path)) {
          extension = ext;
          break;
        }
      }
      
      const newFileName = `${baseName}new-file-${Date.now()}${extension}`;
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
</html>`
      }[language] || `// ${newFileName}\n// New file created`;

      const newFile = {
        path: newFileName,
        content: defaultContent,
        language: language,
        id: generateSafeId(newFileName),
        name: newFileName.split('/').pop(),
        fullPath: newFileName,
        type: 'file'
      };
      
      handleArtifactUpdate([...currentArtifacts, newFile]);
      setSelectedFile(newFile);
      setEditedContent(newFile.content);
      setIsEditing(true);
      setViewMode('editor');
      if (isMobile) setMobilePanel('editor');
    }, [currentArtifacts, handleArtifactUpdate, isMobile]);

    const fileTree = useMemo(() => {
      const tree = {};
      
      const limitedArtifacts = currentArtifacts.slice(0, 100);
      
      limitedArtifacts.forEach(file => {
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

      return items.map((key) => {
        const item = node[key];
        if (!item) return null;
        
        const isExpanded = expandedFolders.has(item.fullPath);
        const isSelected = selectedFile?.path === item.fullPath;

        if (item.type === 'file') {
          return (
            <div
              key={`file-${item.fullPath}`}
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
      <div className={`artifact-manager ${isMobile ? 'mobile' : ''}`}>
        {(!isMobile || mobilePanel === 'tree') && (
          <div className="file-tree-panel">
            <div className="panel-header">
              <div className="panel-title">
                <SquareStack size={16} />
                <span>Project Files</span>
                <span className="file-count">({currentArtifacts.length})</span>
              </div>
              <button 
                onClick={(e) => handleCreateFile(e, '')} 
                className="icon-button small primary" 
                title="Create new file"
                aria-label="Create new file"
              >
                <Plus size={14} />
              </button>
            </div>
            
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
              {Object.keys(filteredFileTree).length === 0 ? (
                <div className="empty-tree-state">
                  <FileText size={20} />
                  <p>No files found</p>
                  {debouncedSearchTerm && <small>Try a different search term</small>}
                </div>
              ) : (
                <FileTreeComponent node={filteredFileTree} />
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
                  onClick={(e) => handleCreateFile(e, '')} 
                  className="create-file-button"
                  aria-label="Create new file"
                >
                  <Plus size={16} />Create New File
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
                  <div className="header-title">Ollama Chat</div>
                  {currentArtifacts.length > 0 && (
                    <div className="header-subtitle">
                      <FileText size={12} />
                      <span>Reading {currentArtifacts.length} file{currentArtifacts.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
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
                {currentArtifacts.length > 0 && !isMobile && (
                  <button 
                    className={`icon-button ${showArtifacts ? 'active' : ''}`} 
                    onClick={toggleArtifactsPanel} 
                    title="Project Files"
                    aria-label={showArtifacts ? "Hide project files" : "Show project files"}
                  >
                    <SquareStack className="icon" />
                  </button>
                )}
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

        <StorageManagement />
        <SidePanel />

        <div className="main-content">
          {showArtifacts && (
            <div className={`artifacts-panel ${isMobile ? 'mobile' : ''} ${showArtifacts ? 'open' : ''}`}>
              <div className="artifacts-header">
                <h3>Project Files ({currentArtifacts.length})</h3>
                <button onClick={toggleArtifactsPanel} className="icon-button" aria-label="Close project files"><X size={16} /></button>
              </div>
              <ArtifactManager isMobile={isMobile} />
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

        {isMobile && currentArtifacts.length > 0 && (
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