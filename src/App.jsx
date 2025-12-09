import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Copy,
  Check,
  Trash2,
  User,
  Bot,
  Sun,
  Moon,
  Square,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [theme, setTheme] = useState("light");
  const [expandedBlocks, setExpandedBlocks] = useState({});
  const abortControllerRef = useRef(null);
  const [models, setModels] = useState({ cloud: [], nonCloud: [] });
  const [selectedModel, setSelectedModel] = useState("minimax-m2:cloud");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [ollamaError, setOllamaError] = useState(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showUnrecommended, setShowUnrecommended] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setOllamaError(null);
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags");
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          const modelNames = data.models.map(m => m.name);
          // Separate cloud and non-cloud models
          const cloudModels = modelNames.filter(name => name.toLowerCase().includes('cloud'));
          const nonCloudModels = modelNames.filter(name => !name.toLowerCase().includes('cloud'));
          setModels({ cloud: cloudModels, nonCloud: nonCloudModels });
          
          // Set the first cloud model as selected, or first model if no cloud models
          if (!modelNames.includes(selectedModel)) {
            setSelectedModel(cloudModels.length > 0 ? cloudModels[0] : modelNames[0]);
          }
        }
      } else {
        setOllamaError("Failed to connect to Ollama. Please ensure Ollama is running.");
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
      setOllamaError("Cannot connect to Ollama. Please start the Ollama service.");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      console.error("Copy failed");
    }
  };

  const clearChat = () => confirm("Clear all messages?") && setMessages([]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", content: input.trim(), id: Date.now() };
    const assistantMessage = { role: "assistant", content: "", id: Date.now() + 1, isStreaming: true };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error(res.statusText);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n").filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              full += json.message.content;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: full } : m))
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Don't update messages here, they're already removed by stopGeneration
        return;
      } else if (err.message.includes('Failed to fetch') || err.name === 'TypeError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `⚠️ Cannot connect to Ollama. Please ensure Ollama is running at localhost:11434`, isError: true }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `⚠️ Error: ${err.message}`, isError: true }
              : m
          )
        );
      }
    } finally {
      setMessages((prev) => prev.map((m) => ({ ...m, isStreaming: false })));
      setIsLoading(false);
      abortControllerRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // Remove the last user message and the incomplete assistant message
      setMessages((prev) => prev.slice(0, -2));
    }
  };

  const renderMessage = (content, messageId, isAssistant) =>
    content.split("```").map((part, i) => {
      if (i % 2) {
        // This is a code block
        if (isAssistant) {
          // Strip language identifier from first line for assistant messages
          const lines = part.split('\n');
          const firstLine = lines[0].trim().toLowerCase();
          
          // Check if first line is a language identifier (common ones)
          const languageIdentifiers = ['bash', 'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'c++', 'csharp', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'html', 'css', 'json', 'yaml', 'xml', 'markdown', 'md', 'sh', 'shell', 'jsx', 'tsx'];
          
          let codeContent = part;
          let language = '';
          if (languageIdentifiers.includes(firstLine)) {
            // Remove the first line (language identifier)
            language = firstLine;
            codeContent = lines.slice(1).join('\n');
          }
          
          const blockId = `${messageId}-code-${i}`;
          const isExpanded = expandedBlocks[blockId];
          
          return (
            <div key={i} className="code-block-wrapper">
              <div 
                className="code-block-header"
                onClick={() => setExpandedBlocks(prev => ({ ...prev, [blockId]: !prev[blockId] }))}
              >
                <span className="code-block-language">{language || 'code'}</span>
                <span className="code-block-toggle">{isExpanded ? '−' : '+'}</span>
              </div>
              {isExpanded && (
                <>
                  <pre className="code-block"><code>{codeContent}</code></pre>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(codeContent, blockId);
                    }} 
                    className="code-copy-button"
                  >
                    {copied === blockId ? <Check className="icon-small" /> : <Copy className="icon-small" />}
                  </button>
                </>
              )}
            </div>
          );
        } else {
          // For user messages, render code inline without special formatting
          return <span key={i} className="message-text">{part}</span>;
        }
      }
      return <span key={i} className="message-text">{part}</span>;
    });

  const Avatar = ({ role }) => {
    const isUser = role === "user";
    return (
      <div className={`avatar ${isUser ? "avatar-user" : "avatar-assistant"}`}>
        {isUser ? <User className="avatar-icon" /> : <Bot className="avatar-icon" />}
      </div>
    );
  };

  return (
    <div className={`app-container ${theme}-theme`}>
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-avatar">
             <User className="icon" />
            </div>
            <div>
              <div className="header-title">Ollama Chat</div>
              <div className="header-subtitle">
                {isLoadingModels ? (
                  "Loading models..."
                ) : (models.cloud.length > 0 || models.nonCloud.length > 0) ? (
                  <div className="model-selector">
                    <button 
                      className="model-select-button"
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                    >
                      {selectedModel}
                      <span className="dropdown-arrow">{showModelDropdown ? '▲' : '▼'}</span>
                    </button>
                    {showModelDropdown && (
                      <div className="model-dropdown">
                        {models.cloud.map((model) => (
                          <div
                            key={model}
                            className={`model-option ${selectedModel === model ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedModel(model);
                              setShowModelDropdown(false);
                            }}
                          >
                            {model}
                          </div>
                        ))}
                        {models.nonCloud.length > 0 && (
                          <>
                            <div 
                              className="model-option-group"
                              onClick={() => setShowUnrecommended(!showUnrecommended)}
                            >
                              <span>Unrecommended</span>
                              <span className="group-arrow">{showUnrecommended ? '−' : '+'}</span>
                            </div>
                            {showUnrecommended && models.nonCloud.map((model) => (
                              <div
                                key={model}
                                className={`model-option model-option-unrecommended ${selectedModel === model ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedModel(model);
                                  setShowModelDropdown(false);
                                  setShowUnrecommended(false);
                                }}
                              >
                                {model}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  selectedModel
                )}
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button onClick={toggleTheme} className="icon-button theme-button">
              {theme === "dark" ? <Sun className="icon" /> : <Moon className="icon" />}
            </button>
            <button onClick={clearChat} className="icon-button clear-button">
              <Trash2 className="icon" />
            </button>
          </div>
        </div>
      </header>

      <main className="messages-container">
        <div className="messages-inner">
          {ollamaError ? (
            <div className="error-screen">
              <div className="error-icon">
                <Bot className="icon-large" />
              </div>
              <h2 className="error-title">Ollama Connection Error</h2>
              <p className="error-message">{ollamaError}</p>
              <button onClick={fetchModels} className="retry-button">
                Retry Connection
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon">
                <Bot className="icon-large" />
              </div>
              <h2 className="welcome-title">Welcome to your local model</h2>
              <p className="welcome-subtitle">Type below to start chatting with Ollama</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className={`message-row ${m.role === "user" ? "message-row-user" : "message-row-assistant"}`}
                >
                  <Avatar role={m.role} />
                  <div className={`bubble ${m.role === "user" ? "bubble-user" : m.isError ? "bubble-error" : "bubble-assistant"}`}>
                    {renderMessage(m.content || (m.isStreaming ? "" : null), m.id, m.role === "assistant")}
                    {m.isStreaming && (
                      <div className="typing-dots-container">
                        <div className="typing-dots">
                          <span></span><span></span><span></span>
                        </div>
                      </div>
                    )}
                    {!m.isStreaming && m.role === "assistant" && m.content && (
                      <button onClick={() => copyToClipboard(m.content, m.id)} className="copy-button">
                        {copied === m.id ? <><Check className="icon-small" />Copied</> : <><Copy className="icon-small" />Copy</>}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="input-footer">
        <div className="input-container">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Send a message..."
            className="input-textarea"
            disabled={isLoading}
          />
          <div className="input-actions">
            <button
              onClick={isLoading ? stopGeneration : sendMessage}
              disabled={!isLoading && !input.trim()}
              className="send-button"
            >
              {isLoading ? <Square className="icon" /> : <Send className="icon" />}
            </button>
          </div>
          <p className="footer-text">Connected to Ollama at localhost:11434</p>
        </div>
      </footer>
    </div>
  );
}