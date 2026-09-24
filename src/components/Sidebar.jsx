import React from 'react';

/**
 * Sidebar Navigation Component
 * Features:
 * - 5 Dedicated Navigation items (Dashboard, My Skills, My Projects, Learning Progress, Career Goal)
 * - Clear active state with visual indicator & glow
 * - Dynamic counts and percentage badges
 * - Responsive mobile drawer toggle
 */
export default function Sidebar({
  activePage,
  setActivePage,
  skillsCount,
  projectsCount,
  learningPercentage,
  studentName,
  studentBadge,
  mobileOpen,
  setMobileOpen,
  onOpenAiMentor,
  currentUser,
  onOpenAuthModal
}) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      ),
      badge: null
    },
    {
      id: 'skills',
      label: 'My Skills',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      ),
      badge: skillsCount
    },
    {
      id: 'projects',
      label: 'My Projects',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      ),
      badge: projectsCount
    },
    {
      id: 'learning',
      label: 'Learning Progress',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      ),
      badge: `${learningPercentage}%`
    },
    {
      id: 'planner',
      label: 'Learning Planner',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
      ),
      badge: 'Roadmap'
    },
    {
      id: 'career',
      label: 'Career Goal',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="6"></circle>
          <circle cx="12" cy="12" r="2"></circle>
        </svg>
      ),
      badge: 'Target'
    }
  ];

  // Helper for student initials
  const initials = studentName
    ? studentName.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'ST';

  return (
    <>
      {/* Backdrop for mobile drawer */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div>
            <span className="brand-title">LearnOrbit</span>
            <span className="brand-subtitle">Career & Skill Planner</span>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="sidebar-nav" aria-label="Main Navigation">
          <span className="nav-section-label">Navigation</span>
          {navItems.map(item => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActivePage(item.id);
                  if (setMobileOpen) setMobileOpen(false);
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="nav-item-left">
                  <span className="nav-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Career Copilot Quick Launch */}
        <div className="sidebar-ai-card">
          <div className="sidebar-ai-header">
            <span className="sidebar-ai-icon">✨</span>
            <span className="sidebar-ai-title">Career Copilot</span>
          </div>
          <p className="sidebar-ai-text">Personalized guidance based on your live skill gaps & roadmap.</p>
          <button
            id="sidebar-ask-ai-btn"
            onClick={() => onOpenAiMentor && onOpenAiMentor()}
            className="sidebar-ai-btn"
            title="Chat with Career Copilot"
          >
            Ask Career Copilot →
          </button>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="sidebar-footer">
          {currentUser ? (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">{initials}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name" title={studentName}>{studentName}</span>
                <span className="sidebar-user-role" title={studentBadge}>{studentBadge}</span>
              </div>
            </div>
          ) : (
            <div className="sidebar-guest-card" style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px dashed var(--border-card)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Unauthenticated Session
              </div>
              <button
                className="btn btn-sm btn-primary"
                style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
                onClick={() => onOpenAuthModal && onOpenAuthModal('login')}
              >
                Sign In / Register
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
