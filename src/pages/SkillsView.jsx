import React, { useState, useEffect, useCallback } from 'react';
import { getSkillsEvidence } from '../apiConfig';

/**
 * 2. Evidence-Based Skills Portfolio View
 * Shows verifiable evidence for every skill:
 * - self-reported level
 * - practical assessment score
 * - completed milestones count
 * - related portfolio projects
 * - study hours logged
 * - evidence confidence (High / Medium / Low) with why explanation
 * - "Take Career Assessment" trigger
 */
export default function SkillsView({
  skills,
  skillsLoading,
  skillsError,
  onOpenAddSkill,
  onOpenEditSkill,
  onDeleteSkill,
  onOpenAssessment
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [evidenceList, setEvidenceList] = useState([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [expandedWhySkillId, setExpandedWhySkillId] = useState(null);

  const categories = ['all', 'Frontend', 'Backend', 'AI & Data', 'DevOps & Cloud'];

  // Load evidence profiles
  const fetchEvidence = useCallback(async () => {
    setLoadingEvidence(true);
    try {
      const data = await getSkillsEvidence();
      setEvidenceList(data || []);
    } catch (err) {
      console.error('Failed to load skills evidence:', err);
    } finally {
      setLoadingEvidence(false);
    }
  }, []);

  useEffect(() => {
    fetchEvidence();
  }, [skills, fetchEvidence]);

  // Combine skills with their evidence record
  const evidenceMap = evidenceList.reduce((acc, cur) => {
    acc[cur.skill_id] = cur;
    return acc;
  }, {});

  // Filter skills
  const filteredSkills = skills.filter(skill => {
    const category = skill.category || 'General';
    const matchesCat = selectedCategory === 'all' || category === selectedCategory;
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Analytics counts
  const highConfidenceCount = evidenceList.filter(e => e.evidence_confidence === 'High').length;
  const mediumConfidenceCount = evidenceList.filter(e => e.evidence_confidence === 'Medium').length;
  const assessedCount = evidenceList.filter(e => e.assessment_score !== null).length;

  return (
    <div className="page-content-wrapper">
      
      {/* Banner Header */}
      <div className="view-header-banner">
        <div className="view-header-text">
          <h1>Evidence-Based Skill Portfolio</h1>
          <p>
            Verifiable technical capabilities supported by practical assessments, curriculum milestones,
            portfolio code projects, and documented study hours.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            id="take-assessment-btn"
            className="btn btn-outline"
            onClick={() => onOpenAssessment && onOpenAssessment()}
          >
            🧠 Take Skill Assessment
          </button>
          <button id="add-skill-page-btn" className="btn btn-primary" onClick={onOpenAddSkill}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add New Skill</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <section className="kpi-grid">
        <article className="metric-card">
          <div className="card-icon-wrap icon-purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Total Tracked Skills</span>
            <div className="metric-number-row">
              <span className="metric-value">{skills.length}</span>
            </div>
            <span className="metric-caption">In active portfolio</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-emerald">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">High Evidence Confidence</span>
            <div className="metric-number-row">
              <span className="metric-value">{highConfidenceCount}</span>
              <span className="metric-trend trend-up">Verified</span>
            </div>
            <span className="metric-caption">Assessment + Project proof</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Medium Confidence</span>
            <div className="metric-number-row">
              <span className="metric-value">{mediumConfidenceCount}</span>
              <span className="metric-trend trend-highlight">Growing</span>
            </div>
            <span className="metric-caption">Milestones & study hours</span>
          </div>
        </article>

        <article className="metric-card">
          <div className="card-icon-wrap icon-amber">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </div>
          <div className="metric-info">
            <span className="metric-title">Skills Assessed</span>
            <div className="metric-number-row">
              <span className="metric-value">{assessedCount} / {skills.length}</span>
            </div>
            <span className="metric-caption">Quiz benchmarks completed</span>
          </div>
        </article>
      </section>

      {/* Filter & Search Bar */}
      <div className="skills-controls-bar">
        <div className="skill-category-filters">
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === 'all' ? 'All Skills' : cat}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="search-input-box"
          placeholder="Search skills (e.g. React, Python, Docker)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Evidence-Based Skills Grid */}
      <section className="content-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <div className="badge-dot dot-purple"></div>
            <h2>Showing {filteredSkills.length} of {skills.length} Evidence-Verified Skills</h2>
          </div>
          {loadingEvidence && (
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)' }}>Calculating evidence metrics...</span>
          )}
        </div>

        {skillsLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600 }}>Loading skills from database...</p>
          </div>
        ) : skillsError ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--accent-rose)' }}>
            <p style={{ fontWeight: 600 }}>Unable to load skills</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{skillsError}</p>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            No matching skills found. Click <strong>Add New Skill</strong> to register one.
          </div>
        ) : (
          <div className="evidence-skills-grid">
            {filteredSkills.map(skill => {
              const ev = evidenceMap[skill.id] || {
                self_reported_level: skill.level || 'Intermediate',
                assessment_score: null,
                milestones_display: '0/0',
                related_projects_count: 0,
                study_hours: 0.0,
                evidence_confidence: 'Low',
                confidence_reason: 'Self-reported level. Not yet verified by assessment or project code.'
              };

              const confClass = ev.evidence_confidence.toLowerCase();
              const isWhyExpanded = expandedWhySkillId === skill.id;

              return (
                <article key={skill.id} className="evidence-skill-card">
                  
                  {/* Top: Skill name & Confidence Badge */}
                  <div className="ev-card-top">
                    <div>
                      <h3 className="ev-skill-title">{skill.name}</h3>
                      <span className="ev-skill-cat">{skill.category || 'General'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`ev-conf-badge conf-${confClass}`}>
                        {ev.evidence_confidence} Confidence
                      </span>
                      <button
                        className="delete-btn"
                        onClick={() => onOpenEditSkill && onOpenEditSkill(skill)}
                        title="Edit skill"
                        aria-label={`Edit ${skill.name}`}
                      >
                        ✏️
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => onDeleteSkill(skill.id)}
                        title="Remove skill"
                        aria-label={`Delete ${skill.name}`}
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* 4 Telemetry Metrics Grid */}
                  <div className="ev-metrics-grid">
                    
                    <div className="ev-metric-item">
                      <span className="ev-metric-lbl">Reported Level</span>
                      <strong className={`skill-level-tag level-${(ev.self_reported_level || 'intermediate').toLowerCase()}`}>
                        {ev.self_reported_level}
                      </strong>
                    </div>

                    <div className="ev-metric-item">
                      <span className="ev-metric-lbl">Assessment</span>
                      <strong className={ev.assessment_score !== null ? 'color-accent' : 'color-muted'}>
                        {ev.assessment_score !== null ? `${ev.assessment_score}%` : 'Not assessed yet'}
                      </strong>
                    </div>

                    <div className="ev-metric-item">
                      <span className="ev-metric-lbl">Milestones</span>
                      <strong>{ev.milestones_display}</strong>
                    </div>

                    <div className="ev-metric-item">
                      <span className="ev-metric-lbl">Projects / Study</span>
                      <strong>{ev.related_projects_count} prjs • {ev.study_hours}h</strong>
                    </div>

                  </div>

                  {/* WHY Confidence Explanation */}
                  <div className="ev-why-container">
                    <button
                      className="ev-why-toggle"
                      onClick={() => setExpandedWhySkillId(isWhyExpanded ? null : skill.id)}
                    >
                      <span>{isWhyExpanded ? '▼' : '►'} Why is confidence {ev.evidence_confidence}?</span>
                    </button>
                    {isWhyExpanded && (
                      <div className="ev-why-content">
                        <p>{ev.confidence_reason}</p>
                        <p className="ev-disclaimer-text">
                          <em>Evidence Confidence reflects documented learning milestones, projects, and assessments. It does not claim absolute job ability.</em>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Footer */}
                  <div className="ev-card-footer">
                    <button
                      className="btn btn-sm btn-outline btn-full"
                      onClick={() => onOpenAssessment && onOpenAssessment()}
                    >
                      🧠 Assess {skill.name}
                    </button>
                  </div>

                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
