import React from 'react';

/**
 * Top Navbar Component
 * Features:
 * - Mobile hamburger menu toggle
 * - Dynamic page breadcrumb/title
 * - Dark/Light mode switcher
 * - AI Mentor quick-access trigger
 * - "Edit Profile" modal trigger
 * - Authenticated user state / pill / Login & Register buttons
 */
export default function Navbar({
  activePage,
  theme,
  toggleTheme,
  onOpenEditProfile,
  onToggleMobileMenu,
  onOpenAiMentor,
  currentUser,
  onOpenAuthModal,
  onLogout
}) {
  const pageTitles = {
    dashboard: 'Overview Dashboard',
    skills: 'My Skills Portfolio',
    projects: 'My Projects Showcase',
    learning: 'Curriculum & Learning Progress',
    planner: 'Personalized Learning Roadmap & Streaks',
    career: 'Career Goal & Strategic Roadmap'
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  return (
    <header className="app-navbar">
      <div className="navbar-left">
        <button
          className="mobile-menu-btn"
          id="mobile-menu-toggle"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="page-breadcrumb">
          <span>LearnOrbit</span>
          <span>/</span>
          <span className="current-page-name">{pageTitles[activePage] || 'Dashboard'}</span>
        </div>
      </div>

      <div className="navbar-right">
        {/* Theme Toggle Button */}
        <button
          id="theme-toggle-btn"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>

        {/* Career Copilot Trigger */}
        <button
          id="navbar-ai-mentor-btn"
          className="btn btn-outline ai-nav-btn"
          onClick={onOpenAiMentor}
          title="Open Career Copilot"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" fill="currentColor" fillOpacity="0.25"/>
            <path d="M19 2v4M17 4h4"/>
          </svg>
          <span>Career Copilot</span>
        </button>

        {/* Edit Profile Trigger */}
        <button
          id="edit-profile-trigger-btn"
          className="btn btn-outline"
          onClick={onOpenEditProfile}
          title="Edit Student Profile & Goal"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Edit Profile</span>
        </button>

        {/* User Status / Authentication Action */}
        {currentUser ? (
          <div className="navbar-auth-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="navbar-user-pill" title={`Logged in as ${currentUser.name} (${currentUser.email})`}>
              <div className="navbar-user-avatar">{getInitials(currentUser.name)}</div>
              <div className="navbar-user-info">
                <span className="navbar-user-name">{currentUser.name}</span>
                <span className="navbar-user-badge">Student</span>
              </div>
            </div>
            <button
              id="navbar-logout-btn"
              className="btn auth-nav-btn auth-logout-btn"
              onClick={onLogout}
              title="Sign out of your account"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <div className="navbar-auth-group" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              id="navbar-login-btn"
              className="btn btn-outline auth-nav-btn"
              onClick={() => onOpenAuthModal('login')}
              title="Sign in to your account"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              <span>Sign In</span>
            </button>
            <button
              id="navbar-register-btn"
              className="btn btn-primary auth-nav-btn"
              onClick={() => onOpenAuthModal('register')}
              title="Create a new student account"
            >
              <span>Register</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
