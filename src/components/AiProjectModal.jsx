import React, { useState, useEffect } from 'react';
import { generateAiProject, createProject } from '../apiConfig';

export default function AiProjectModal({ isOpen, onClose, onProjectSaved, showToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [projectDraft, setProjectDraft] = useState(null);

  useEffect(() => {
    if (isOpen) {
      handleGenerate();
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateAiProject();
      setProjectDraft(data);
    } catch (err) {
      console.error('AI Project Generation error:', err);
      setError('Failed to generate project proposal. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!projectDraft) return;
    setSaving(true);
    try {
      const payload = {
        title: projectDraft.title,
        description: projectDraft.description,
        target_skills: projectDraft.target_skills || [],
        difficulty: projectDraft.difficulty || 'Intermediate',
        estimated_hours: projectDraft.estimated_hours || 24.0,
        status: 'In Progress',
        notes: projectDraft.alignment_reason || '',
        milestones: (projectDraft.milestones || []).map(m => ({
          title: typeof m === 'string' ? m : m.title,
          completed: false
        }))
      };

      const created = await createProject(payload);
      showToast(`Project '${created.title}' added to your portfolio!`, 'success');
      if (onProjectSaved) onProjectSaved(created);
      onClose();
    } catch (err) {
      console.error('Save project error:', err);
      showToast(err.message || 'Failed to save project', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window ai-project-modal" onClick={e => e.stopPropagation()}>
        
        <div className="modal-header">
          <div>
            <span className="modal-category-tag">AI Portfolio Architect</span>
            <h2 className="modal-title">AI Project Generator</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert-notice alert-danger">
              <p>{error}</p>
              <button className="btn btn-sm btn-secondary" onClick={handleGenerate}>Try Again</button>
            </div>
          )}

          {loading ? (
            <div className="empty-state-notice" style={{ padding: '3rem 1rem' }}>
              <span className="spinner"></span>
              <p style={{ marginTop: '1rem', fontWeight: 600 }}>Analyzing your active skill gaps & career milestones...</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Gemini is synthesizing a portfolio project tailored to bridge your missing skills into verifiable code evidence.
              </p>
            </div>
          ) : projectDraft ? (
            <div className="project-proposal-wrap">
              
              {/* Proposal Header Card */}
              <div className="proposal-card">
                <div className="proposal-badge-row">
                  <span className="badge badge-accent">AI Proposed Project</span>
                  <span className={`skill-level-tag level-${projectDraft.difficulty.toLowerCase()}`}>
                    {projectDraft.difficulty}
                  </span>
                  <span className="meta-tag">⏱ ~{projectDraft.estimated_hours} Hours</span>
                </div>

                <h3 className="proposal-title">{projectDraft.title}</h3>
                <p className="proposal-desc">{projectDraft.description}</p>

                {projectDraft.alignment_reason && (
                  <div className="alignment-callout">
                    <span className="callout-icon">🎯</span>
                    <div>
                      <strong>Why this project?</strong>
                      <p>{projectDraft.alignment_reason}</p>
                    </div>
                  </div>
                )}

                <div className="proposal-skills-row">
                  <span className="skills-label">Target Skills Bridged:</span>
                  <div className="skills-tags-wrap">
                    {(projectDraft.target_skills || []).map((sk, idx) => (
                      <span key={idx} className="tech-tag tag-primary">{sk}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Milestones Blueprint */}
              <div className="proposal-milestones-section">
                <h4>Suggested Architecture Milestones ({projectDraft.milestones ? projectDraft.milestones.length : 0})</h4>
                <div className="milestones-checklist-preview">
                  {(projectDraft.milestones || []).map((m, idx) => {
                    const mTitle = typeof m === 'string' ? m : m.title;
                    return (
                      <div key={idx} className="milestone-preview-item">
                        <span className="milestone-check-box">□</span>
                        <span className="milestone-preview-title">{mTitle}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="proposal-notice">
                <p>
                  <strong>Confirmation Required:</strong> Review this project proposal. Clicking <em>Save to Portfolio</em> will store it in your PostgreSQL database and enable step-by-step milestone tracking.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleGenerate}
                  disabled={loading || saving}
                >
                  Regenerate Idea
                </button>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Confirm & Save Project to Portfolio'}
                  </button>
                </div>
              </div>

            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
