import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, authFetch } from '../apiConfig';

/**
 * 5. Career Goal & Skill-Gap Analyzer View
 * Features:
 * - Real-time synchronization with PostgreSQL database
 * - Dynamic career role selection from predefined database roles
 * - Weighted readiness calculation (Advanced = 1.0, Intermediate = 0.8, Beginner = 0.5, Missing = 0.0)
 * - Matched skills, missing skills, and prioritized recommendations
 * - Four-Phase Strategic Roadmap
 */
export default function CareerGoalView({
  profile,
  learningPercentage,
  onOpenEditProfile,
  showToast = () => {},
  onGoalUpdated = () => {}
}) {
  const [roles, setRoles] = useState([]);
  const [activeGoal, setActiveGoal] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch initial data: roles, active goal, and initial gap analysis
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch available career roles from PostgreSQL
      const rolesRes = await authFetch(`${API_BASE_URL}/api/career-roles`);
      if (!rolesRes.ok) throw new Error(`Failed to load career roles (${rolesRes.status})`);
      const rolesData = await rolesRes.json();
      setRoles(rolesData);

      // 2. Fetch active student career goal
      const goalRes = await authFetch(`${API_BASE_URL}/api/career-goal`);
      if (!goalRes.ok) throw new Error(`Failed to load student career goal (${goalRes.status})`);
      const goalData = await goalRes.json();
      setActiveGoal(goalData);

      const targetRoleId = goalData?.career_role_id || (rolesData[0] ? rolesData[0].id : null);
      setSelectedRoleId(targetRoleId);

      // 3. Fetch gap analysis for the active role
      if (targetRoleId) {
        const gapRes = await authFetch(`${API_BASE_URL}/api/career-gap-analysis?role_id=${targetRoleId}`);
        if (!gapRes.ok) throw new Error(`Failed to load skill-gap analysis (${gapRes.status})`);
        const gapData = await gapRes.json();
        setGapAnalysis(gapData);
      }
    } catch (err) {
      console.error('Error loading career goal data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Handle career role change
  const handleRoleChange = async (e) => {
    const newRoleId = Number(e.target.value);
    setSelectedRoleId(newRoleId);
    setSaving(true);

    try {
      // 1. Persist updated goal to PostgreSQL
      const updateRes = await authFetch(`${API_BASE_URL}/api/career-goal`, {
        method: 'PUT',
        body: JSON.stringify({ career_role_id: newRoleId })
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to update career goal (${updateRes.status})`);
      }

      const updatedGoal = await updateRes.json();
      setActiveGoal(updatedGoal);
      onGoalUpdated(updatedGoal);

      // 2. Fetch fresh gap analysis for new role
      const gapRes = await authFetch(`${API_BASE_URL}/api/career-gap-analysis?role_id=${newRoleId}`);
      if (!gapRes.ok) throw new Error('Failed to recalculate skill gap');
      const gapData = await gapRes.json();
      setGapAnalysis(gapData);

      showToast(`Target role updated to: ${updatedGoal.role_name}`, 'success');
    } catch (err) {
      console.error('Role update error:', err);
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Strategic 4-phase roadmap data
  const roadmapPhases = [
    {
      phase: "Phase 1: Computer Science Foundations & Algorithms",
      status: "Completed",
      timing: "Months 1 - 6",
      desc: "Data structures, algorithms, operating systems, networking protocols, and complexity analysis."
    },
    {
      phase: "Phase 2: Modern Full-Stack & Microservices Architecture",
      status: "Completed",
      timing: "Months 7 - 12",
      desc: "RESTful APIs with FastAPI & Express, React architecture, relational database indexing, and Docker containerization."
    },
    {
      phase: "Phase 3: Deep Learning, Vector Search & Distributed Agents",
      status: "In Progress",
      timing: "Months 13 - 18",
      desc: "Transformer pipelines, semantic search engines, multi-agent frameworks, and high-throughput vector databases."
    },
    {
      phase: "Phase 4: Production Capstone & Technical Architecture Interviews",
      status: "Upcoming",
      timing: "Months 19 - 24",
      desc: "Deploying enterprise-grade open source projects, system design mock interviews, and applying to target research labs."
    }
  ];

  // Selected role object
  const currentRole = roles.find(r => r.id === selectedRoleId) || activeGoal;
  const readinessPercent = gapAnalysis ? gapAnalysis.readiness_percentage : 0;

  // Determine readiness status label & style
  const getReadinessBadge = (pct) => {
    if (pct >= 70) {
      return { label: 'High Alignment • Target Ready', className: 'status-completed', color: 'var(--accent-emerald)' };
    }
    if (pct >= 35) {
      return { label: 'Developing Competency', className: 'status-in-progress', color: 'var(--accent-amber)' };
    }
    return { label: 'Foundational Stage', className: 'status-under-review', color: 'var(--accent-purple)' };
  };

  const readinessBadge = getReadinessBadge(readinessPercent);

  return (
    <div className="page-content-wrapper">
      
      {/* Banner Header */}
      <div className="view-header-banner">
        <div className="view-header-text">
          <h1>Career Skill-Gap Analyzer</h1>
          <p>
            Dynamically evaluate your skill inventory against industry benchmarks, identify curriculum gaps, and track real-time readiness.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            id="refresh-gap-analysis-btn"
            className="btn btn-outline"
            onClick={fetchInitialData}
            title="Refresh database analysis"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            <span>Refresh Analysis</span>
          </button>
          <button id="update-career-goal-btn" className="btn btn-primary" onClick={onOpenEditProfile}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="empty-state-panel" style={{ borderColor: 'var(--accent-rose)', margin: '1rem 0' }}>
          <p style={{ color: 'var(--accent-rose)', fontWeight: '600' }}>Error connecting to Career API: {error}</p>
          <button className="btn btn-primary" onClick={fetchInitialData} style={{ marginTop: '0.75rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* Grid: Career Spotlight + Attributes */}
      <div className="career-overview-grid">
        
        {/* Left: Target Focus Box with Dropdown Selector */}
        <div className="career-target-info-box">
          <div className="target-title-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="target-badge">Primary Professional Target</span>
              {saving && (
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', fontWeight: '600' }}>
                  Saving to PostgreSQL...
                </span>
              )}
            </div>

            {/* Career Role Dropdown Selector */}
            <div className="role-selector-wrap">
              <label htmlFor="career-role-select" className="role-selector-label">
                Select Career Track (PostgreSQL):
              </label>
              <select
                id="career-role-select"
                className="role-selector-dropdown"
                value={selectedRoleId || ''}
                onChange={handleRoleChange}
                disabled={loading || saving}
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="target-desc">
            {currentRole?.description || activeGoal?.role_description || profile.goalDesc || 'Focusing on high-throughput distributed systems and scalable modern architectures.'}
          </p>

          <div className="career-attributes">
            <div className="attribute-item">
              <span className="attr-title">Target Date:</span>
              <span className="attr-val">{activeGoal?.target_date || profile.targetDate || 'December 2026'}</span>
            </div>
            <div className="attribute-item">
              <span className="attr-title">Target Industries:</span>
              <span className="attr-val">{activeGoal?.target_industries || profile.targetIndustries || 'AI Platforms, Cloud Infrastructure, Fintech'}</span>
            </div>
            <div className="attribute-item">
              <span className="attr-title">Target Locations:</span>
              <span className="attr-val">{activeGoal?.target_locations || profile.targetLocations || 'San Francisco, CA / Remote'}</span>
            </div>
            <div className="attribute-item">
              <span className="attr-title">Student Profile:</span>
              <span className="attr-val">{activeGoal?.student_name || profile.name} • {profile.badge} (GPA {profile.gpa})</span>
            </div>
            <div className="attribute-item">
              <span className="attr-title">Database Source:</span>
              <span className="attr-val" style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="badge-dot dot-emerald" style={{ display: 'inline-block' }}></span>
                PostgreSQL (student_career)
              </span>
            </div>
          </div>
        </div>

        {/* Right: Dynamic Readiness Score Card */}
        <section className="content-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="panel-header">
              <div className="panel-title-wrap">
                <div className="badge-dot dot-amber"></div>
                <h2>Target Readiness Score</h2>
              </div>
              <span className={`status-badge ${readinessBadge.className}`}>
                {readinessBadge.label}
              </span>
            </div>

            <div style={{ margin: '1rem 0 0.5rem' }}>
              <div className="readiness-score-hero">
                <span className="readiness-score-val" style={{ color: readinessBadge.color }}>
                  {readinessPercent}%
                </span>
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                  Readiness
                </span>
              </div>

              {/* Progress Bar */}
              <div className="milestone-progress-bar-wrap" style={{ height: '12px', margin: '0.75rem 0' }}>
                <div
                  className="milestone-progress-bar"
                  style={{
                    width: `${readinessPercent}%`,
                    background: readinessBadge.color || 'var(--accent-primary)'
                  }}
                ></div>
              </div>
            </div>

            {/* Gap Metrics Summary Grid */}
            <div className="gap-stats-grid">
              <div className="gap-stat-cell">
                <span className="gap-stat-label">Earned Score</span>
                <span className="gap-stat-number" style={{ color: 'var(--accent-purple)' }}>
                  {gapAnalysis ? gapAnalysis.total_earned_points : 0}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/{gapAnalysis ? gapAnalysis.total_possible_weight : 0}</span>
                </span>
              </div>
              <div className="gap-stat-cell">
                <span className="gap-stat-label">Total Skills</span>
                <span className="gap-stat-number">{gapAnalysis ? gapAnalysis.total_skills_required : 0}</span>
              </div>
              <div className="gap-stat-cell">
                <span className="gap-stat-label">Matched</span>
                <span className="gap-stat-number" style={{ color: 'var(--accent-emerald)' }}>
                  {gapAnalysis ? gapAnalysis.matched_count : 0}
                </span>
              </div>
              <div className="gap-stat-cell">
                <span className="gap-stat-label">Missing</span>
                <span className="gap-stat-number" style={{ color: 'var(--accent-rose)' }}>
                  {gapAnalysis ? gapAnalysis.missing_count : 0}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Readiness formula: <strong>Round(Earned Points / Total Possible Weight × 100)</strong>.<br />
              Proficiency multipliers: Advanced (1.0x), Intermediate (0.8x), Beginner (0.5x), Missing (0.0x).
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '0.85rem', marginTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>
              ✓ Target Hiring Cycle: {activeGoal?.target_date || profile.targetDate}
            </span>
          </div>
        </section>

      </div>

      {/* Two-Column Breakdown: Matched Skills vs Missing Skills */}
      <div className="gap-analysis-panels-grid">
        
        {/* Left Column: Matched Skills */}
        <section className="content-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <div className="badge-dot dot-emerald"></div>
              <h2>Verified Competencies ({gapAnalysis ? gapAnalysis.matched_count : 0})</h2>
            </div>
            <span className="status-badge status-completed">In Student Skills</span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Skills from your profile that directly satisfy the required competencies for this career role.
          </p>

          <div className="gap-skills-list">
            {gapAnalysis && gapAnalysis.matched_skills && gapAnalysis.matched_skills.length > 0 ? (
              gapAnalysis.matched_skills.map((skill) => (
                <div key={skill.id} className="gap-skill-card" style={{ borderLeft: '3px solid var(--accent-emerald)' }}>
                  <div className="gap-skill-card-header">
                    <span className="gap-skill-name">{skill.skill_name}</span>
                    <span className={`skill-level-tag level-${(skill.student_level || 'intermediate').toLowerCase()}`}>
                      {skill.student_level} ({Math.round(skill.proficiency_multiplier * 100)}%)
                    </span>
                  </div>
                  <div className="gap-skill-meta">
                    <span style={{ color: 'var(--text-muted)' }}>{skill.category}</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>
                      +{skill.earned_points} / {skill.weight} pts (Weight: {skill.weight})
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state-panel" style={{ padding: '2rem 1rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No verified skills matched for this track yet. Add relevant competencies on the <strong>My Skills</strong> page to earn readiness points.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Missing Skills */}
        <section className="content-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <div className="badge-dot dot-rose"></div>
              <h2>Curriculum Skill Gap ({gapAnalysis ? gapAnalysis.missing_count : 0})</h2>
            </div>
            <span className="status-badge status-under-review">Role Requirements</span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Required core competencies currently missing from your portfolio. Complete these to raise your readiness.
          </p>

          <div className="gap-skills-list">
            {gapAnalysis && gapAnalysis.missing_skills && gapAnalysis.missing_skills.length > 0 ? (
              gapAnalysis.missing_skills.map((skill) => (
                <div key={skill.id} className="gap-skill-card" style={{ borderLeft: '3px solid var(--accent-rose)' }}>
                  <div className="gap-skill-card-header">
                    <span className="gap-skill-name">{skill.skill_name}</span>
                    <span className={`status-badge ${skill.importance === 'Core' ? 'status-in-progress' : 'status-completed'}`}>
                      {skill.importance}
                    </span>
                  </div>
                  <div className="gap-skill-meta">
                    <span style={{ color: 'var(--text-muted)' }}>{skill.category}</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-rose)' }}>
                      Missing (Weight: {skill.weight}) • 0.0 pts
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state-panel" style={{ padding: '2rem 1rem' }}>
                <p style={{ color: 'var(--accent-emerald)', fontSize: '0.9rem', fontWeight: '600' }}>
                  Outstanding! You have acquired all required skills for this specialization track.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Recommended Next Skills to Bridge the Gap */}
      <section className="content-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <div className="badge-dot dot-purple"></div>
            <h2>Recommended Next Skills to Bridge the Gap</h2>
          </div>
          <span className="status-badge status-in-progress">Actionable Roadmap</span>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Prioritized curriculum recommendations ranked by core architectural importance and weighted scoring impact.
        </p>

        <div className="recommendations-grid">
          {gapAnalysis && gapAnalysis.recommended_next_skills && gapAnalysis.recommended_next_skills.length > 0 ? (
            gapAnalysis.recommended_next_skills.slice(0, 4).map((skill, idx) => {
              const potentialGain = gapAnalysis.total_possible_weight > 0
                ? Math.round((skill.weight * 1.0 / gapAnalysis.total_possible_weight) * 100)
                : 0;

              return (
                <div key={skill.id} className="recommendation-card">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className="recommendation-badge-rank">Priority #{idx + 1}</span>
                      <span className={`status-badge ${skill.importance === 'Core' ? 'status-in-progress' : 'status-completed'}`}>
                        {skill.importance}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      {skill.skill_name}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Category: <strong>{skill.category}</strong>
                    </p>
                  </div>

                  <div style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.775rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Scoring Weight:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{skill.weight} pts</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.775rem', marginTop: '0.25rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Readiness Boost:</span>
                      <strong style={{ color: 'var(--accent-emerald)' }}>+{potentialGain}%</strong>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state-panel" style={{ gridColumn: '1 / -1', padding: '1.5rem' }}>
              <p style={{ color: 'var(--text-secondary)' }}>All required competencies for this specialization are in your portfolio!</p>
            </div>
          )}
        </div>
      </section>

      {/* Strategic Roadmap Timeline */}
      <section className="content-panel">
        <div className="panel-header">
          <div className="panel-title-wrap">
            <div className="badge-dot dot-purple"></div>
            <h2>Four-Phase Career Roadmap</h2>
          </div>
          <span className="status-badge status-completed">Multi-Term Strategy</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {roadmapPhases.map((phase, idx) => {
            const statusClass = phase.status === 'Completed'
              ? 'status-completed'
              : phase.status === 'In Progress'
                ? 'status-in-progress'
                : 'status-under-review';

            return (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-card)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>{phase.phase}</h3>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{phase.timing}</span>
                    <span className={`status-badge ${statusClass}`}>{phase.status}</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{phase.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}
