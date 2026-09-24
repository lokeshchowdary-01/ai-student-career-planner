import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, authFetch } from '../apiConfig';

/**
 * Lightweight Markdown Parser for AI Responses
 * Handles headings (#, ##, ###), bullets, numbered lists, code blocks, bold, and inline code.
 */
function MarkdownView({ content }) {
  if (!content) return null;

  // Split content by fenced code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="ai-markdown-body">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const firstLineEnd = part.indexOf('\n');
          const lang = firstLineEnd !== -1 ? part.substring(3, firstLineEnd).trim() : 'text';
          const code = firstLineEnd !== -1 ? part.substring(firstLineEnd + 1, part.length - 3).trim() : part.slice(3, -3).trim();
          return (
            <div key={index} className="ai-code-block">
              <div className="ai-code-header">
                <span>{lang || 'code'}</span>
              </div>
              <pre><code>{code}</code></pre>
            </div>
          );
        }

        // Parse paragraphs, headings, and lists
        const lines = part.split('\n');
        return (
          <div key={index} className="ai-text-block">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="ai-spacer" />;

              // Headings
              if (trimmed.startsWith('### ')) {
                return <h4 key={lIdx} className="ai-h4">{renderFormattedText(trimmed.substring(4))}</h4>;
              }
              if (trimmed.startsWith('## ')) {
                return <h3 key={lIdx} className="ai-h3">{renderFormattedText(trimmed.substring(3))}</h3>;
              }
              if (trimmed.startsWith('# ')) {
                return <h2 key={lIdx} className="ai-h2">{renderFormattedText(trimmed.substring(2))}</h2>;
              }

              // Bullet points
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="ai-bullet-item">
                    <span className="ai-bullet-dot">•</span>
                    <span>{renderFormattedText(trimmed.substring(2))}</span>
                  </div>
                );
              }

              // Numbered lists
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="ai-bullet-item">
                    <span className="ai-num-badge">{numMatch[1]}.</span>
                    <span>{renderFormattedText(numMatch[2])}</span>
                  </div>
                );
              }

              return <p key={lIdx} className="ai-paragraph">{renderFormattedText(trimmed)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Helper to render inline **bold**, `code`, and markdown links */
function renderFormattedText(text) {
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g);
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={i}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={i} className="ai-inline-code">{token.slice(1, -1)}</code>;
    }
    const linkMatch = token.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="ai-link">
          {linkMatch[1]}
        </a>
      );
    }
    return token;
  });
}

/**
 * AIChatDrawer Component
 * Interactive glassmorphic AI Mentor drawer connected to FastAPI backend.
 */
export default function AIChatDrawer({ isOpen, onToggle, showToast, currentUser }) {
  const studentName = currentUser ? currentUser.name : 'Alex';
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        `👋 **Hello ${studentName}!** I am your **LearnOrbit Career Copilot**.\n\nI analyze your live PostgreSQL career benchmarks, readiness scores, missing skills, and study streaks to guide your engineering roadmap. What would you like to explore today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);
  const [aiStatus, setAiStatus] = useState({ configured: false, model: 'gemini-3.6-flash', provider: 'google-gemini' });
  const [suggestedPrompts, setSuggestedPrompts] = useState([
    "What should I focus on first to raise my readiness?",
    "Why is Docker prioritized before other missing skills?",
    "Review my study streak and suggest an optimal weekly schedule.",
    "Which pending milestone has the highest career impact?"
  ]);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Fetch AI status and suggested prompts on mount / when auth changes
  useEffect(() => {
    authFetch(`${API_BASE_URL}/api/ai/status`)
      .then(res => res.json())
      .then(data => setAiStatus(data))
      .catch(err => console.warn('Could not fetch AI status:', err));

    authFetch(`${API_BASE_URL}/api/ai/suggested-prompts`)
      .then(res => res.json())
      .then(data => {
        if (data.prompts && data.prompts.length > 0) {
          setSuggestedPrompts(data.prompts);
        }
      })
      .catch(err => console.warn('Could not fetch suggested prompts:', err));
  }, [currentUser]);

  const handleSendMessage = async (textToSend) => {
    const messageText = (typeof textToSend === 'string' ? textToSend : inputMessage).trim();
    if (!messageText || loading) return;

    setErrorNotice(null);

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setLoading(true);

    try {
      // Build conversation history (excluding initial greeting) for backend
      const historyPayload = newHistory
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await authFetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: messageText,
          history: historyPayload
        })
      });

      if (!res.ok) {
        throw new Error(`API responded with HTTP status ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        contextHighlights: data.context_highlights,
        retrievedKnowledge: data.retrieved_knowledge,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setErrorNotice('Failed to receive response. Please ensure the backend is running.');
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          `⚠️ **Connection Notice**: Unable to contact the Career Copilot service. Please ensure the FastAPI backend is running on \`${API_BASE_URL}\`.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "✨ **Conversation cleared.** Feel free to ask anything about your skills, readiness score, learning roadmap, or study habits!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setErrorNotice(null);
    if (showToast) showToast('Conversation cleared', 'info');
  };

  return (
    <>
      {/* Floating Career Copilot Button (Bottom Right) */}
      <button
        id="ai-mentor-floating-btn"
        className={`ai-mentor-floating-btn ${isOpen ? 'active' : ''}`}
        onClick={onToggle}
        aria-label="Open Career Copilot"
        title="Chat with Career Copilot"
      >
        <div className="floating-btn-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" fill="currentColor" fillOpacity="0.25"/>
            <path d="M19 2v4M17 4h4"/>
          </svg>
        </div>
        <span className="floating-btn-text">Career Copilot</span>
        <span className={`floating-btn-pulse ${aiStatus.configured ? 'online' : 'standby'}`}></span>
      </button>

      {/* Backdrop */}
      {isOpen && <div className="ai-drawer-backdrop" onClick={onToggle} aria-hidden="true" />}

      {/* Career Copilot Slide-Out Drawer */}
      <aside className={`ai-drawer-container ${isOpen ? 'open' : ''}`} aria-label="Career Copilot Chat Drawer">
        {/* Header */}
        <div className="ai-drawer-header">
          <div className="ai-header-info">
            <div className="ai-avatar-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" fill="currentColor" fillOpacity="0.25"/>
                <path d="M19 2v4M17 4h4"/>
              </svg>
              <span className={`ai-status-dot ${aiStatus.configured ? 'online' : 'standby'}`}></span>
            </div>
            <div>
              <div className="ai-header-title-row">
                <h3 className="ai-header-title">Career Copilot</h3>
                <span className="ai-model-tag" title={`Active Model: ${aiStatus.model}`}>
                  {aiStatus.model || 'Gemini'}
                </span>
              </div>
              <p className="ai-header-sub">Grounded in Live PostgreSQL Career Benchmarks</p>
            </div>
          </div>

          <div className="ai-header-actions">
            <button
              onClick={handleClearChat}
              className="ai-icon-btn"
              title="Clear Conversation"
              aria-label="Clear conversation history"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button
              onClick={onToggle}
              className="ai-icon-btn close-btn"
              title="Close Drawer"
              aria-label="Close mentor drawer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Optional Error Alert */}
        {errorNotice && (
          <div className="ai-error-banner">
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Message Thread Body */}
        <div className="ai-messages-body">
          {messages.map(msg => (
            <div key={msg.id} className={`ai-message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}>
              {msg.role === 'assistant' && (
                <div className="ai-msg-avatar">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="8" width="18" height="12" rx="2"></rect>
                    <circle cx="8" cy="14" r="1.5" fill="currentColor"></circle>
                    <circle cx="16" cy="14" r="1.5" fill="currentColor"></circle>
                  </svg>
                </div>
              )}

              <div className="ai-msg-bubble">
                <MarkdownView content={msg.content} />

                {/* Live Context Highlights Card */}
                {msg.contextHighlights && (
                  <div className="ai-context-card">
                    <div className="ai-context-header">
                      <span className="ai-context-icon">📊</span>
                      <span>Evaluated Career Ground Truth ({msg.contextHighlights.student_name})</span>
                    </div>
                    <div className="ai-context-tags">
                      <span className="ai-ctx-tag">
                        <strong>Role:</strong> {msg.contextHighlights.role_name}
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Readiness:</strong> {msg.contextHighlights.readiness_percentage}%
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Top Priority:</strong> {msg.contextHighlights.top_recommended_skill}
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Missing:</strong> {msg.contextHighlights.total_missing_skills} skills
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Streak:</strong> {msg.contextHighlights.current_streak_days} days 🔥
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Milestones:</strong> {msg.contextHighlights.pending_milestones_count} pending
                      </span>
                      <span className="ai-ctx-tag">
                        <strong>Study:</strong> {msg.contextHighlights.total_study_hours} hrs logged
                      </span>
                    </div>
                  </div>
                )}

                <span className="ai-msg-timestamp">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {/* Typing State */}
          {loading && (
            <div className="ai-message-row assistant-row">
              <div className="ai-msg-avatar loading">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="8" width="18" height="12" rx="2"></rect>
                </svg>
              </div>
              <div className="ai-msg-bubble ai-typing-bubble">
                <span className="ai-typing-dot"></span>
                <span className="ai-typing-dot"></span>
                <span className="ai-typing-dot"></span>
                <span className="ai-typing-label">Consulting PostgreSQL benchmarks & Gemini...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts Section */}
        {suggestedPrompts.length > 0 && (
          <div className="ai-prompts-bar">
            <span className="ai-prompts-title">Suggested Inquiries:</span>
            <div className="ai-prompts-scroll">
              {suggestedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  className="ai-prompt-chip"
                  onClick={() => handleSendMessage(prompt)}
                  disabled={loading}
                  title="Click to send inquiry"
                >
                  <span className="ai-chip-sparkle">✨</span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="ai-input-bar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="ai-input-form"
          >
            <input
              type="text"
              id="ai-mentor-input"
              className="ai-chat-input"
              placeholder="Ask Career Copilot about skills, readiness, study schedules..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="submit"
              id="ai-mentor-send-btn"
              className="ai-send-btn"
              disabled={!inputMessage.trim() || loading}
              aria-label="Send inquiry"
              title="Send inquiry"
            >
              {loading ? (
                <div className="ai-send-spinner"></div>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              )}
            </button>
          </form>
          <div className="ai-input-footer">
            <span>Press Enter to send • Grounded in live PostgreSQL career data</span>
          </div>
        </div>
      </aside>
    </>
  );
}
