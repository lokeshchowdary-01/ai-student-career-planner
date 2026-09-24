import React, { useState } from 'react';

/**
 * 4. Learning Progress Dedicated View
 */
export default function LearningProgressView({
  milestones,
  learningPercentage,
  onToggleMilestone,
  onAddMilestone,
  onDeleteMilestone
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('CS Core');

  const categories = ['all', 'CS Core', 'Web Development', 'Backend & Systems', 'AI & Machine Learning', 'Cloud & DevOps', 'Portfolio & Career'];

  const filteredMilestones = activeCategory === 'all'
    ? milestones
    : milestones.filter(m => (m.category || 'CS Core') === activeCategory);

  const completedTotal = milestones.filter(m => m.completed).length;
  const pendingTotal = milestones.length - completedTotal;

  // Radial calculation
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (learningPercentage / 100) * circumference;

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddMilestone(newTitle.trim(), newCategory);
    setNewTitle('');
  };

  return (
    <div className="page-content-wrapper">
      
      {/* Banner Header */}
      <div className="view-header-banner">
        <div className="view-header-text">
          <h1>Curriculum & Learning Progress</h1>
          <p>Interactive tracker of computer science foundations, engineering competencies, and professional milestones.</p>
        </div>
        <div className="status-badge status-completed" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
          Interactive Real-Time Recalculation
        </div>
      </div>

      {/* Hero Radial Engine Card */}
      <div className="progress-hero-widget">
        <div className="radial-progress-container">
          <svg className="progress-ring" width="140" height="140">
            <circle className="progress-ring-bg" strokeWidth="11" fill="transparent" r="54" cx="70" cy="70"/>
            <circle
              className="progress-ring-circle"
              strokeWidth="11"
              strokeLinecap="round"
              fill="transparent"
              r="54"
              cx="70"
              cy="70"
              style={{ strokeDashoffset }}
            />
          </svg>
          <div className="radial-center-text">
            <span className="radial-percent">{learningPercentage}%</span>
            <span className="radial-sub">Completed</span>
          </div>
        </div>

        <div className="progress-breakdown-details">
          <div className="stat-mini-row">
            <span className="stat-lbl">Mastered Milestones:</span>
            <strong style={{ color: 'var(--accent-emerald)' }}>{completedTotal} of {milestones.length}</strong>
          </div>
          <div className="stat-mini-row">
            <span className="stat-lbl">Pending Targets:</span>
            <strong style={{ color: 'var(--accent-amber)' }}>{pendingTotal} Remaining</strong>
          </div>
          <div className="stat-mini-row">
            <span className="stat-lbl">Learning Velocity:</span>
            <strong className="color-success">Optimal Pace (+4 completed this cycle)</strong>
          </div>
          <div className="stat-mini-row">
            <span className="stat-lbl">Curriculum Status:</span>
            <span>Senior Capstone & Production Track</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="skill-category-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={`filter-pill ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'all' ? 'All Milestones' : cat}
          </button>
        ))}
      </div>

      {/* Checklist Panel */}
      <section className="content-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <div className="badge-dot dot-blue"></div>
            <h2>Milestones Checklist (Showing {filteredMilestones.length})</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Check an item to immediately update overall progress percentage
          </span>
        </div>

        {filteredMilestones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No milestones found in this category.
          </div>
        ) : (
          <div className="milestones-checklist">
            {filteredMilestones.map(m => (
              <div key={m.id} className={`milestone-item ${m.completed ? 'completed' : ''}`}>
                <div className="milestone-left">
                  <input
                    type="checkbox"
                    id={`chk-lp-${m.id}`}
                    className="custom-checkbox"
                    checked={m.completed}
                    onChange={(e) => onToggleMilestone(m.id, e.target.checked)}
                  />
                  <label htmlFor={`chk-lp-${m.id}`} className="milestone-label">
                    {m.title}
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="tech-tag" style={{ fontSize: '0.7rem' }}>{m.category || 'General'}</span>
                  <button
                    className="delete-btn"
                    onClick={() => onDeleteMilestone(m.id)}
                    title="Remove milestone"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline Add Milestone Form */}
        <form onSubmit={handleAddSubmit} className="inline-add-form">
          <input
            type="text"
            placeholder="Add new custom curriculum milestone..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-card)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 0.85rem',
              fontSize: '0.8rem'
            }}
          >
            <option value="CS Core">CS Core</option>
            <option value="Web Development">Web Development</option>
            <option value="Backend & Systems">Backend & Systems</option>
            <option value="AI & Machine Learning">AI & Machine Learning</option>
            <option value="Cloud & DevOps">Cloud & DevOps</option>
            <option value="Portfolio & Career">Portfolio & Career</option>
          </select>
          <button type="submit" className="btn btn-primary btn-sm">
            Add Milestone
          </button>
        </form>
      </section>

    </div>
  );
}
