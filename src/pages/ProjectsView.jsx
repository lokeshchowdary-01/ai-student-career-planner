import React, { useState, useEffect, useCallback } from 'react';
import { getProjects, deleteProject, toggleProjectMilestone } from '../apiConfig';
import AiProjectModal from '../components/AiProjectModal';

/**
 * 4. Project-Based Learning Dedicated View
 * Features:
 * - Direct PostgreSQL persistence for projects and milestones
 * - Milestones checklist with interactive completion toggles
 * - Alignment with target career role and missing skill gaps
 * - AI Project Generation with mandatory student confirmation
 * - Zero data fabrication: returns empty state ("Not enough data yet") when no projects exist
 */
export default function ProjectsView({
  projects: initialProjects = [],
  onOpenAddProject,
  onDeleteProject: propDeleteProject,
  showToast = () => {}
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [togglingMilestoneId, setTogglingMilestoneId] = useState(null);

  const statuses = ['all', 'In Progress', 'Completed', 'Under Review', 'Planned'];

  // Load projects from PostgreSQL
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data || []);
    } catch (err) {
      console.warn('Projects fetch error, using local fallback:', err);
      if (initialProjects && initialProjects.length > 0) {
        setProjects(initialProjects);
      }
    } finally {
      setLoading(false);
    }
  }, [initialProjects]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Handle milestone completion toggle
  const handleToggleMilestone = async (projectId, milestoneId, currentCompleted) => {
    setTogglingMilestoneId(milestoneId);
    const newStatus = !currentCompleted;

    // Optimistic local update
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== projectId) return p;
        const updatedMilestones = (p.milestones || []).map(m =>
          m.id === milestoneId ? { ...m, completed: newStatus } : m
        );
        const comp = updatedMilestones.filter(m => m.completed).length;
        const total = updatedMilestones.length;
        const pct = total > 0 ? Math.round((comp / total) * 100) : (newStatus ? 100 : 0);
        return {
          ...p,
          milestones: updatedMilestones,
          progress_percentage: pct,
          status: pct === 100 ? 'Completed' : (pct > 0 ? 'In Progress' : p.status)
        };
      })
    );

    try {
      await toggleProjectMilestone(projectId, milestoneId, newStatus);
      showToast(newStatus ? 'Project milestone completed!' : 'Milestone marked as pending', 'info');
    } catch (err) {
      console.error('Failed to toggle project milestone:', err);
      showToast('Could not save milestone status', 'error');
      fetchProjects();
    } finally {
      setTogglingMilestoneId(null);
    }
  };

  // Handle delete project
  const handleDelete = async (projectId) => {
    if (!window.confirm('Are you sure you want to remove this project from your portfolio?')) {
      return;
    }

    try {
      await deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      showToast('Project deleted from portfolio', 'info');
      if (propDeleteProject) propDeleteProject(projectId);
    } catch (err) {
      console.error('Delete project error:', err);
      showToast('Failed to delete project', 'error');
    }
  };

  // Filter projects
  const filteredProjects = projects.filter(project => {
    const title = project.title || '';
    const desc = project.description || project.desc || '';
    const tags = project.target_skills || project.tags || [];

    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    const matchesSearch =
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  const totalProjects = projects.length;
  const completedCount = projects.filter(p => p.status === 'Completed').length;
  const inProgressCount = projects.filter(p => p.status === 'In Progress').length;
  const totalMilestones = projects.reduce((acc, p) => acc + (p.milestones ? p.milestones.length : 0), 0);
  const completedMilestones = projects.reduce(
    (acc, p) => acc + (p.milestones ? p.milestones.filter(m => m.completed).length : 0),
    0
  );

  return (
    <div className="page-content-wrapper">

      {/* Banner Header */}
      <div className="view-header-banner">
        <div className="view-header-text">
          <h1>Project-Based Learning Hub</h1>
          <p>
            Build real software evidence that demonstrates ability for target career roles.
            Each project tracks milestone execution and targets specific skill gaps.
          </p>
        </div>
        <div className="banner-actions-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            id="ai-generate-project-btn"
            className="btn btn-primary btn-ai-pulse"
            onClick={() => setIsAiModalOpen(true)}
            title="Generate custom project aligned with your career skill gaps"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>✨ AI Generate Project</span>
          </button>

          <button
            id="add-project-page-btn"
            className="btn btn-secondary"
            onClick={onOpenAddProject}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Custom Project</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <section className="kpi-grid">
        <article className="metric-card">
          <div className="card-icon-wrap icon-emerald">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Portfolio Projects</span>
            <div className="metric-number-row">
              <span className="metric-value">{totalProjects}</span>
            </div>
            <span className="metric-caption">Active verifiable builds</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Completed & Shipped</span>
            <div className="metric-number-row">
              <span className="metric-value">{completedCount}</span>
              <span className="metric-trend trend-up">Production Ready</span>
            </div>
            <span className="metric-caption">Full milestone execution</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">In Progress</span>
            <div className="metric-number-row">
              <span className="metric-value">{inProgressCount}</span>
              <span className="metric-trend trend-highlight">Active</span>
            </div>
            <span className="metric-caption">Currently under development</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-amber">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Milestones Cleared</span>
            <div className="metric-number-row">
              <span className="metric-value">{completedMilestones} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {totalMilestones}</small></span>
            </div>
            <span className="metric-caption">Verifiable task completion</span>
          </div>
        </article>
      </section>

      {/* Filter & Search Bar */}
      <div className="skills-controls-bar">
        <div className="skill-category-filters">
          {statuses.map(st => (
            <button
              key={st}
              className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? 'All Projects' : st}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="search-input-box"
          placeholder="Search projects by title, skill, or keyword..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Projects Grid */}
      <section className="content-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <div className="badge-dot dot-emerald"></div>
            <h2>Showing {filteredProjects.length} Projects</h2>
          </div>
          {loading && <span className="text-muted" style={{ fontSize: '0.85rem' }}>Syncing PostgreSQL...</span>}
        </div>

        {filteredProjects.length === 0 ? (
          <div className="empty-state-notice" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📁</div>
            <h3>Not enough data yet</h3>
            <p style={{ maxWidth: '500px', margin: '0.5rem auto 1.5rem auto', color: 'var(--text-muted)' }}>
              Projects provide concrete proof of your abilities to hiring managers.
              Generate an AI project tailored to your missing career skills, or add your existing work.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setIsAiModalOpen(true)}
            >
              ✨ AI Generate Project
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map(project => {
              const statusSlug = (project.status || 'in-progress').toLowerCase().replace(/\s+/g, '-');
              const tags = project.target_skills || project.tags || [];
              const desc = project.description || project.desc || '';
              const milestonesList = project.milestones || [];
              const progressPct = project.progress_percentage !== undefined
                ? project.progress_percentage
                : (milestonesList.length > 0
                    ? Math.round((milestonesList.filter(m => m.completed).length / milestonesList.length) * 100)
                    : (project.status === 'Completed' ? 100 : 0));

              return (
                <article key={project.id} className="project-card upgraded-project-card">
                  <div className="project-top-header">
                    <div>
                      <div className="project-top">
                        <h3 className="project-title">{project.title}</h3>
                        <span className={`status-badge status-${statusSlug}`}>{project.status}</span>
                      </div>
                      <div className="project-meta-pills" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        {project.difficulty && (
                          <span className="meta-pill pill-difficulty">{project.difficulty}</span>
                        )}
                        {project.estimated_hours && (
                          <span className="meta-pill pill-hours">⏱ ~{project.estimated_hours}h estimated</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="project-desc" style={{ margin: '0.75rem 0' }}>{desc}</p>

                  {/* Target Skills Tags */}
                  {tags.length > 0 && (
                    <div className="project-tags-section" style={{ marginBottom: '1rem' }}>
                      <span className="sub-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                        Target Career Skills:
                      </span>
                      <div className="project-tags">
                        {tags.map((tag, idx) => (
                          <span key={idx} className="tech-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes / Career Alignment Reason */}
                  {project.notes && (
                    <div className="project-alignment-note" style={{
                      padding: '0.6rem 0.8rem',
                      background: 'var(--accent-indigo-subtle)',
                      borderRadius: '8px',
                      borderLeft: '3px solid var(--accent-primary)',
                      fontSize: '0.8rem',
                      marginBottom: '1rem',
                      color: 'var(--text-primary)'
                    }}>
                      <strong>Career Alignment:</strong> {project.notes}
                    </div>
                  )}

                  {/* Milestones Checklist */}
                  <div className="project-milestones-section">
                    <div className="milestones-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Milestones ({milestonesList.filter(m => m.completed).length}/{milestonesList.length})
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: progressPct === 100 ? 'var(--accent-emerald)' : 'var(--accent-primary)' }}>
                        {progressPct}%
                      </span>
                    </div>

                    <div className="milestone-progress-bar-wrap" style={{ height: '6px', marginBottom: '0.75rem', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        className="milestone-progress-bar"
                        style={{
                          width: `${progressPct}%`,
                          height: '100%',
                          background: progressPct === 100 ? 'var(--accent-emerald)' : 'var(--accent-primary)',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>

                    {milestonesList.length > 0 ? (
                      <div className="project-milestones-checklist">
                        {milestonesList.map(m => (
                          <label
                            key={m.id}
                            className={`project-milestone-item ${m.completed ? 'm-completed' : ''}`}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                              padding: '0.35rem 0',
                              fontSize: '0.82rem',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={m.completed}
                              disabled={togglingMilestoneId === m.id}
                              onChange={() => handleToggleMilestone(project.id, m.id, m.completed)}
                              style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                            />
                            <span style={{
                              textDecoration: m.completed ? 'line-through' : 'none',
                              color: m.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                              lineHeight: '1.4'
                            }}>
                              {m.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No specific milestones configured for this project.
                      </span>
                    )}
                  </div>

                  {/* Project Footer */}
                  <div className="project-footer" style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {project.github_url || project.link ? (
                      <a
                        href={project.github_url || project.link}
                        target="_blank"
                        rel="noreferrer"
                        className="project-link"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Repository / Demo
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Internal Repository</span>
                    )}
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDelete(project.id)}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* AI Project Proposal Modal */}
      <AiProjectModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onProjectSaved={(newPrj) => {
          fetchProjects();
          showToast(`Project '${newPrj.title}' saved to PostgreSQL!`, 'success');
        }}
        showToast={showToast}
      />

    </div>
  );
}
