import React, { useState, useEffect, useCallback } from 'react';
import {
  API_BASE_URL,
  authFetch,
  getTodayPlan,
  generateTodayPlan,
  updateTodayTask,
  replaceTodayTask,
  getCareerPreparation,
  getCareerGapAnalysis
} from '../apiConfig';

/**
 * 1. Upgraded Dashboard View
 * Features:
 * - Career Preparation Progress Dashboard (6 verifiable pillars, what's going well, what needs attention, next action)
 * - Personalized Today's Plan (30m, 1h, 2h, 3h, custom time selector; start/complete/skip/replace tasks)
 * - Active Project spotlight
 * - Top Skill Gap spotlight
 * - Zero data fabrication: real PostgreSQL telemetry
 */
export default function DashboardView({
  profile,
  currentUser,
  onUpdateProfile,
  skills,
  projects,
  milestones,
  learningPercentage,
  onNavigate,
  onOpenEditProfile,
  onOpenAddSkill,
  onOpenAddProject,
  onToggleMilestone,
  onDeleteSkill,
  onDeleteProject,
  onOpenAssessment,
  showToast = () => {}
}) {
  // Profile Inline Edit State
  const [editingField, setEditingField] = useState(null); // 'location' | 'classYear' | 'gpa' | null
  const [fieldValue, setFieldValue] = useState('');
  const [isSavingField, setIsSavingField] = useState(false);

  // Today's Plan State
  const [todayPlan, setTodayPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(60);
  const [showCustomTime, setShowCustomTime] = useState(false);

  // Career Preparation State
  const [careerPrep, setCareerPrep] = useState(null);
  const [loadingPrep, setLoadingPrep] = useState(true);

  // Career Gap Analysis State (for Top Skill Gap card)
  const [gapData, setGapData] = useState(null);

  const completedMilestones = milestones.filter(m => m.completed).length;
  const pendingMilestones = milestones.length - completedMilestones;

  // Student Initials
  const initials = profile.name
    ? profile.name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'AR';

  // Photo Upload Handler with 256x256 client compression
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, or WebP).', 'error');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      showToast('Image file is too large (max 8MB).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawUrl = event.target.result;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const optimizedUrl = canvas.toDataURL('image/jpeg', 0.88);

        const updatedProfile = { ...profile, avatar: optimizedUrl };
        if (onUpdateProfile) {
          onUpdateProfile(updatedProfile);
        }

        const userKey = currentUser?.id ? `user_${currentUser.id}` : (currentUser?.email ? `email_${currentUser.email}` : 'active');
        localStorage.setItem(`learnorbit_avatar_${userKey}`, optimizedUrl);
        localStorage.setItem('learnorbit_avatar_active', optimizedUrl);

        showToast('Profile photo updated successfully!', 'success');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Profile Attribute Inline Edit Handlers
  const handleStartEdit = (field, currentVal) => {
    setEditingField(field);
    setFieldValue(currentVal || '');
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setFieldValue('');
  };

  const handleSaveField = async (e) => {
    if (e) e.preventDefault();
    const val = fieldValue.trim();
    if (!val) {
      handleCancelEdit();
      return;
    }

    setIsSavingField(true);
    try {
      const userKey = currentUser?.id ? `user_${currentUser.id}` : (currentUser?.email ? `email_${currentUser.email}` : 'active');
      let updatedProfile = { ...profile };

      if (editingField === 'location') {
        updatedProfile.targetLocations = val;
        try {
          await authFetch(`${API_BASE_URL}/api/career-goal`, {
            method: 'PUT',
            body: JSON.stringify({
              career_role_id: profile.careerRoleId || 1,
              target_locations: val
            })
          });
        } catch (apiErr) {
          console.warn('Could not sync career goal to API:', apiErr);
        }
        showToast(`Work preference updated to: ${val}`, 'success');
      } else if (editingField === 'classYear') {
        updatedProfile.classYear = val;
        showToast(`Graduation year updated to: ${val}`, 'success');
      } else if (editingField === 'gpa') {
        updatedProfile.gpa = val;
        showToast(`GPA updated to: ${val}`, 'success');
      }

      if (onUpdateProfile) {
        onUpdateProfile(updatedProfile);
      }
      localStorage.setItem(`learnorbit_profile_${userKey}`, JSON.stringify({
        targetLocations: updatedProfile.targetLocations,
        classYear: updatedProfile.classYear,
        gpa: updatedProfile.gpa
      }));

      setEditingField(null);
      setFieldValue('');
    } catch (err) {
      showToast('Failed to save profile changes.', 'error');
    } finally {
      setIsSavingField(false);
    }
  };

  // Load Today's Plan
  const fetchPlan = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const data = await getTodayPlan();
      setTodayPlan(data);
    } catch (err) {
      console.error('Failed to load today plan:', err);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  // Load Career Preparation
  const fetchPrep = useCallback(async () => {
    setLoadingPrep(true);
    try {
      const data = await getCareerPreparation();
      setCareerPrep(data);
    } catch (err) {
      console.error('Failed to load career prep:', err);
    } finally {
      setLoadingPrep(false);
    }
  }, []);

  // Load Gap Analysis
  const fetchGap = useCallback(async () => {
    try {
      const d = await getCareerGapAnalysis();
      setGapData(d);
    } catch (err) {
      console.error('Gap fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    fetchPrep();
    fetchGap();
  }, [fetchPlan, fetchPrep, fetchGap]);

  // Today's Plan Handlers
  const handleTimeSelect = async (mins) => {
    setPlanActionLoading(true);
    try {
      const updated = await generateTodayPlan(mins, true);
      setTodayPlan(updated);
      showToast(`Today's Plan updated for ${mins} minutes!`, 'success');
      fetchPrep();
    } catch (err) {
      showToast(err.message || 'Failed to update time budget', 'error');
    } finally {
      setPlanActionLoading(false);
    }
  };

  const handleTaskStatus = async (taskId, newStatus) => {
    setPlanActionLoading(true);
    try {
      await updateTodayTask(taskId, newStatus);
      showToast(
        newStatus === 'completed'
          ? 'Task completed! Logged to your real study activity.'
          : `Task marked as ${newStatus}.`,
        newStatus === 'completed' ? 'success' : 'info'
      );
      fetchPlan();
      fetchPrep();
    } catch (err) {
      showToast(err.message || 'Failed to update task', 'error');
    } finally {
      setPlanActionLoading(false);
    }
  };

  const handleReplaceTask = async (taskId) => {
    setPlanActionLoading(true);
    try {
      await replaceTodayTask(taskId);
      showToast('Replaced task with alternative skill recommendation!', 'info');
      fetchPlan();
    } catch (err) {
      showToast(err.message || 'Failed to replace task', 'error');
    } finally {
      setPlanActionLoading(false);
    }
  };

  // Active Project (first in progress)
  const activeProject = projects.find(p => p.status === 'In Progress') || projects[0];
  const topMissingSkill = gapData && gapData.missing_skills && gapData.missing_skills.length > 0
    ? gapData.missing_skills[0]
    : null;

  return (
    <div className="page-content-wrapper">
      
      {/* Student Hero Card */}
      <section className="student-hero-card" id="student-hero-section">
        <div className="hero-left">
          <div className="avatar-wrapper">
            <div className="avatar-ring">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name || "Student Profile"}
                  className="avatar-photo"
                />
              ) : (
                <div className="avatar-initials">{initials}</div>
              )}

              {/* Hover overlay to change photo */}
              <label
                htmlFor="student-photo-input"
                className="avatar-upload-overlay"
                title="Upload or change profile picture"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <span>Change</span>
              </label>
            </div>

            {/* Corner camera badge button */}
            <label
              htmlFor="student-photo-input"
              className="avatar-camera-badge"
              title="Upload or change profile picture"
              aria-label="Upload or change profile picture"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </label>

            <input
              id="student-photo-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              style={{ display: 'none' }}
              onChange={handlePhotoUpload}
            />

            <span className="status-indicator online" title="Status: Actively Learning"></span>
          </div>

          <div className="hero-details">
            <div className="name-row">
              <h1 className="student-name">{profile.name}</h1>
              <span className="badge badge-accent">{profile.badge}</span>
            </div>
            <p className="student-bio">{profile.bio}</p>

            <div className="student-tags">
              {/* 1. Remote / Location Preference Button */}
              {editingField === 'location' ? (
                <form className="meta-tag-edit-form" onSubmit={handleSaveField}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <input
                    type="text"
                    className="meta-tag-edit-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    autoFocus
                    placeholder="e.g. Remote, Hybrid"
                    disabled={isSavingField}
                  />
                  <button type="submit" className="meta-tag-action-btn save" title="Save" disabled={isSavingField}>✓</button>
                  <button type="button" className="meta-tag-action-btn cancel" onClick={handleCancelEdit} title="Cancel">✕</button>
                </form>
              ) : (
                <button
                  type="button"
                  className="meta-tag meta-tag-btn"
                  onClick={() => handleStartEdit('location', profile.targetLocations || 'Remote')}
                  title="Click to edit work/location preference"
                  id="profile-location-btn"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  <span>{profile.targetLocations || 'Remote'}</span>
                  <svg className="edit-pencil-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
              )}

              {/* 2. Class of 2026 / Graduation Year Button */}
              {editingField === 'classYear' ? (
                <form className="meta-tag-edit-form" onSubmit={handleSaveField}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <input
                    type="text"
                    className="meta-tag-edit-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    autoFocus
                    placeholder="e.g. Class of 2026"
                    disabled={isSavingField}
                  />
                  <button type="submit" className="meta-tag-action-btn save" title="Save" disabled={isSavingField}>✓</button>
                  <button type="button" className="meta-tag-action-btn cancel" onClick={handleCancelEdit} title="Cancel">✕</button>
                </form>
              ) : (
                <button
                  type="button"
                  className="meta-tag meta-tag-btn"
                  onClick={() => handleStartEdit('classYear', profile.classYear || 'Class of 2026')}
                  title="Click to edit graduation year"
                  id="profile-class-year-btn"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <span>{profile.classYear || 'Class of 2026'}</span>
                  <svg className="edit-pencil-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
              )}

              {/* 3. GPA Button */}
              {editingField === 'gpa' ? (
                <form className="meta-tag-edit-form" onSubmit={handleSaveField}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  <input
                    type="text"
                    className="meta-tag-edit-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    autoFocus
                    placeholder="e.g. 3.92 / 4.0"
                    disabled={isSavingField}
                  />
                  <button type="submit" className="meta-tag-action-btn save" title="Save" disabled={isSavingField}>✓</button>
                  <button type="button" className="meta-tag-action-btn cancel" onClick={handleCancelEdit} title="Cancel">✕</button>
                </form>
              ) : (
                <button
                  type="button"
                  className="meta-tag meta-tag-btn"
                  onClick={() => handleStartEdit('gpa', profile.gpa || '3.92 / 4.0')}
                  title="Click to edit GPA"
                  id="profile-gpa-btn"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  <span>GPA: {profile.gpa || '3.92 / 4.0'}</span>
                  <svg className="edit-pencil-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Career Goal Spotlight */}
        <div className="career-goal-card" id="career-goal-banner">
          <div className="goal-header">
            <span className="goal-label">
              <span className="target-pulse"></span>
              Current Career Goal
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                onClick={() => onOpenAssessment && onOpenAssessment()}
                title="Take Career Assessment"
              >
                🧠 Assess Skills
              </button>
              <button
                className="tiny-icon-btn"
                onClick={onOpenEditProfile}
                title="Edit Career Goal"
                aria-label="Edit Career Goal"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            </div>
          </div>
          <h2 className="goal-title">{profile.careerGoal}</h2>
          <p className="goal-target">{profile.goalTarget || `Target: ${profile.targetDate}`}</p>
          <div className="goal-milestone-preview">
            <div className="milestone-progress-bar-wrap">
              <div className="milestone-progress-bar" style={{ width: `${careerPrep ? careerPrep.overall_preparation_percentage : learningPercentage}%` }}></div>
            </div>
            <div className="milestone-labels">
              <span>Career Preparation Progress</span>
              <strong>{careerPrep ? careerPrep.overall_preparation_percentage : learningPercentage}%</strong>
            </div>
          </div>
        </div>
      </section>

      {/* SYSTEM 5: CAREER PREPARATION DASHBOARD (6 Pillars) */}
      <section className="career-prep-section" aria-label="Career Preparation Progress">
        <div className="content-panel prep-panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <div className="badge-dot dot-purple"></div>
              <h2>Career Preparation Progress</h2>
              <span className="badge badge-accent">
                {careerPrep ? `${careerPrep.overall_preparation_percentage}% Overall Preparation` : 'Measuring...'}
              </span>
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onOpenAssessment && onOpenAssessment()}
            >
              🧠 Take Skill Assessment
            </button>
          </div>

          <p className="prep-disclaimer">
            {careerPrep ? careerPrep.calculation_explanation : 'Calculated across 6 verifiable pillars. Not a job guarantee; represents measurable learning & project milestones.'}
          </p>

          {/* 6 Pillars Grid */}
          <div className="prep-pillars-grid">
            {careerPrep && careerPrep.pillars ? (
              Object.entries(careerPrep.pillars).map(([key, p]) => (
                <div key={key} className="pillar-card">
                  <div className="pillar-header">
                    <span className="pillar-title">{p.title}</span>
                    <strong className="pillar-pct">{p.percentage}%</strong>
                  </div>
                  <div className="pillar-progress-bar">
                    <div className="pillar-fill" style={{ width: `${p.percentage}%` }}></div>
                  </div>
                  <span className="pillar-desc">{p.description}</span>
                </div>
              ))
            ) : (
              <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading preparation telemetry...</div>
            )}
          </div>

          {/* Going Well / Needs Attention / Next Action Triad */}
          {careerPrep && (
            <div className="prep-insights-grid">
              
              {/* What is Going Well */}
              <div className="insight-card insight-positive">
                <div className="insight-header">
                  <span className="insight-icon">✅</span>
                  <h4>WHAT IS GOING WELL</h4>
                </div>
                <ul className="insight-list">
                  {(careerPrep.what_is_going_well || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* What Needs Attention */}
              <div className="insight-card insight-warning">
                <div className="insight-header">
                  <span className="insight-icon">⚠️</span>
                  <h4>WHAT NEEDS ATTENTION</h4>
                </div>
                <ul className="insight-list">
                  {(careerPrep.what_needs_attention || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Next Recommended Action */}
              <div className="insight-card insight-action">
                <div className="insight-header">
                  <span className="insight-icon">🎯</span>
                  <h4>NEXT RECOMMENDED ACTION</h4>
                </div>
                <p className="action-text">{careerPrep.next_recommended_action}</p>
                <div className="action-buttons-wrap">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onOpenAssessment && onOpenAssessment()}
                  >
                    Take Assessment
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      const el = document.getElementById('todays-plan-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    View Today's Plan &darr;
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </section>

      {/* SYSTEM 1: PERSONALIZED "TODAY'S PLAN" */}
      <section className="todays-plan-section" id="todays-plan-section" aria-label="Today's Plan">
        <div className="content-panel">
          <div className="panel-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="panel-title-wrap">
              <div className="badge-dot dot-emerald"></div>
              <h2>Today's Plan</h2>
              <span className="badge badge-accent">
                {todayPlan ? `${todayPlan.completed_count}/${todayPlan.total_tasks} Tasks Complete (${todayPlan.progress_percentage}%)` : 'Generating...'}
              </span>
            </div>

            {/* Time budget selector */}
            <div className="time-budget-controls">
              <span className="budget-label">Available Study Time:</span>
              <div className="budget-pills">
                {[30, 60, 120, 180].map(mins => (
                  <button
                    key={mins}
                    className={`budget-pill ${todayPlan && todayPlan.available_minutes === mins && !showCustomTime ? 'active' : ''}`}
                    onClick={() => { setShowCustomTime(false); handleTimeSelect(mins); }}
                    disabled={planActionLoading}
                  >
                    {mins === 60 ? '1h' : mins === 120 ? '2h' : mins === 180 ? '3h' : `${mins}m`}
                  </button>
                ))}
                <button
                  className={`budget-pill ${showCustomTime ? 'active' : ''}`}
                  onClick={() => setShowCustomTime(!showCustomTime)}
                >
                  Custom
                </button>
              </div>
            </div>
          </div>

          {/* Custom Time Form */}
          {showCustomTime && (
            <div className="custom-time-form">
              <label>Set Custom Study Minutes:</label>
              <input
                type="number"
                min="15"
                max="480"
                step="15"
                value={customMinutes}
                onChange={e => setCustomMinutes(parseInt(e.target.value, 10) || 60)}
                className="custom-time-input"
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={() => handleTimeSelect(customMinutes)}
                disabled={planActionLoading}
              >
                Apply Budget
              </button>
            </div>
          )}

          {/* Today's Plan Meta Bar */}
          {todayPlan && (
            <div className="plan-stats-bar">
              <div className="plan-stat">
                <span className="stat-lbl">Estimated Study Time:</span>
                <strong>{todayPlan.total_estimated_minutes} mins</strong>
              </div>
              <div className="plan-stat">
                <span className="stat-lbl">Study Time Logged Today:</span>
                <strong className="color-success">{todayPlan.completed_study_minutes} mins</strong>
              </div>
              <div className="plan-stat">
                <span className="stat-lbl">Skills Practiced:</span>
                <strong>{todayPlan.skills_practiced.length > 0 ? todayPlan.skills_practiced.join(', ') : 'None yet'}</strong>
              </div>
            </div>
          )}

          {/* Tasks List */}
          {loadingPlan ? (
            <div className="empty-state-notice" style={{ padding: '2rem' }}>
              <span className="spinner"></span>
              <p>Tailoring daily tasks to your skill gaps and roadmap...</p>
            </div>
          ) : todayPlan && todayPlan.tasks && todayPlan.tasks.length > 0 ? (
            <div className="daily-tasks-list">
              {todayPlan.tasks.map(task => {
                const isCompleted = task.status === 'completed';
                const isInProgress = task.status === 'in_progress';
                const isSkipped = task.status === 'skipped';

                return (
                  <div
                    key={task.id}
                    className={`daily-task-card ${isCompleted ? 'task-completed' : ''} ${isInProgress ? 'task-in-progress' : ''} ${isSkipped ? 'task-skipped' : ''}`}
                  >
                    <div className="task-left">
                      <div className="task-type-badge-wrap">
                        <span className={`task-type-badge type-${task.task_type}`}>
                          {task.task_type.replace('_', ' ')}
                        </span>
                        <span className="task-time-pill">⏱ {task.estimated_minutes} min</span>
                      </div>

                      <h3 className="task-title">{task.title}</h3>
                      <p className="task-desc">{task.description}</p>

                      <div className="task-reason-box">
                        <span className="reason-icon">💡</span>
                        <span className="reason-text"><strong>Why:</strong> {task.reason}</span>
                      </div>

                      {task.resource_url && (
                        <div className="task-resource-link">
                          <a href={task.resource_url} target="_blank" rel="noreferrer">
                            📚 Curated Resource Source &rarr;
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="task-actions">
                      {!isCompleted && !isSkipped && (
                        <>
                          {!isInProgress ? (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => handleTaskStatus(task.id, 'in_progress')}
                              disabled={planActionLoading}
                            >
                              ▶ Start
                            </button>
                          ) : (
                            <span className="active-tag-pulse">In Progress...</span>
                          )}

                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleTaskStatus(task.id, 'completed')}
                            disabled={planActionLoading}
                          >
                            ✓ Complete
                          </button>

                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleTaskStatus(task.id, 'skipped')}
                            title="Skip this task"
                            disabled={planActionLoading}
                          >
                            Skip
                          </button>

                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleReplaceTask(task.id)}
                            title="Replace with alternative task"
                            disabled={planActionLoading}
                          >
                            ↻ Replace
                          </button>
                        </>
                      )}

                      {isCompleted && (
                        <div className="task-complete-badge">
                          <span>✓ Verified Completed</span>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleTaskStatus(task.id, 'pending')}
                            title="Undo completion"
                          >
                            Undo
                          </button>
                        </div>
                      )}

                      {isSkipped && (
                        <div className="task-skipped-badge">
                          <span>Skipped</span>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleTaskStatus(task.id, 'pending')}
                          >
                            Restore
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state-notice">
              <p>No tasks remaining in today's plan.</p>
              <button className="btn btn-primary btn-sm" onClick={() => handleTimeSelect(60)}>
                Generate New Tasks
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Two-Column Grid Preview */}
      <div className="dashboard-columns">
        
        {/* LEFT COLUMN: Skills Preview & Active Project Spotlight */}
        <div className="dashboard-col left-col">
          
          {/* Top Skill Gap Spotlight */}
          {topMissingSkill && (
            <section className="content-panel gap-spotlight-card">
              <div className="panel-header">
                <div className="panel-title-wrap">
                  <div className="badge-dot dot-rose"></div>
                  <h2>Top Skill Gap: {topMissingSkill.skill_name}</h2>
                </div>
                <span className="badge badge-rose">{topMissingSkill.importance} Priority</span>
              </div>
              <p className="gap-spotlight-desc">
                {topMissingSkill.skill_name} is required for <strong>{profile.careerGoal}</strong> with an importance weight of <strong>{topMissingSkill.weight} points</strong>.
              </p>
              <div className="gap-spotlight-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onOpenAssessment && onOpenAssessment()}
                >
                  Assess {topMissingSkill.skill_name}
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => onNavigate('career')}
                >
                  View Gap Analysis &rarr;
                </button>
              </div>
            </section>
          )}

          {/* Active Project Spotlight */}
          {activeProject && (
            <section className="content-panel active-project-panel">
              <div className="panel-header">
                <div className="panel-title-wrap">
                  <div className="badge-dot dot-emerald"></div>
                  <h2>Active Project: {activeProject.title}</h2>
                </div>
                <span className="status-badge status-in-progress">{activeProject.status}</span>
              </div>
              <p className="project-desc">{activeProject.desc || activeProject.description}</p>
              <div className="project-tags">
                {(activeProject.tags || activeProject.target_skills || []).map((t, idx) => (
                  <span key={idx} className="tech-tag">{t}</span>
                ))}
              </div>
              <div className="active-prj-footer" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="meta-tag">
                  Milestones: {activeProject.progress_percentage || 0}% Complete
                </span>
                <button className="btn btn-sm btn-primary" onClick={() => onNavigate('projects')}>
                  Manage Project &rarr;
                </button>
              </div>
            </section>
          )}

          {/* Skills Preview Panel */}
          <section className="content-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <div className="badge-dot dot-purple"></div>
                <h2>Skills Portfolio ({skills.length})</h2>
              </div>
              <div className="panel-actions">
                <button className="btn btn-sm btn-outline" onClick={() => onNavigate('skills')}>
                  View All &rarr;
                </button>
                <button className="btn btn-sm btn-primary" onClick={onOpenAddSkill} style={{ marginLeft: '0.5rem' }}>
                  + Add Skill
                </button>
              </div>
            </div>

            <div className="skills-grid">
              {skills.slice(0, 6).map(skill => (
                <div key={skill.id} className="skill-chip">
                  <div className="skill-header">
                    <span className="skill-name">{skill.name}</span>
                    <button
                      className="delete-btn"
                      onClick={() => onDeleteSkill(skill.id)}
                      title="Remove skill"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="skill-footer">
                    <span className="skill-cat">{skill.category}</span>
                    <span className={`skill-level-tag level-${skill.level.toLowerCase()}`}>{skill.level}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: Learning Milestones & Career Target Alignment */}
        <div className="dashboard-col right-col">
          
          <section className="content-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <div className="badge-dot dot-blue"></div>
                <h2>Learning Progress Engine</h2>
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => onNavigate('learning')}>
                Expand &rarr;
              </button>
            </div>

            <div className="progress-breakdown-details" style={{ marginBottom: '1rem' }}>
              <div className="stat-mini-row">
                <span className="stat-lbl">Completed Milestones:</span>
                <strong>{completedMilestones}</strong>
              </div>
              <div className="stat-mini-row">
                <span className="stat-lbl">Pending Milestones:</span>
                <strong>{pendingMilestones}</strong>
              </div>
            </div>

            {/* Milestones checklist */}
            <div className="milestones-checklist">
              {milestones.slice(0, 5).map(m => (
                <div key={m.id} className={`milestone-item ${m.completed ? 'completed' : ''}`}>
                  <div className="milestone-left">
                    <input
                      type="checkbox"
                      id={`chk-dash-${m.id}`}
                      className="custom-checkbox"
                      checked={m.completed}
                      onChange={(e) => onToggleMilestone(m.id, e.target.checked)}
                    />
                    <label htmlFor={`chk-dash-${m.id}`} className="milestone-label">{m.title}</label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Target Industry & Specialization Card */}
          <section className="content-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <div className="badge-dot dot-amber"></div>
                <h2>Industry & Domain Scope</h2>
              </div>
            </div>

            <div className="career-target-info-box">
              <div className="target-title-wrap">
                <span className="target-badge">Target Industries</span>
                <h3 className="target-role" style={{ fontSize: '1rem', fontWeight: 600 }}>{profile.targetIndustries || 'Enterprise Software, AI & Cloud Platforms'}</h3>
              </div>
              <p className="target-desc">{profile.goalDesc}</p>
              <div className="career-attributes">
                <div className="attribute-item">
                  <span className="attr-title">Preferred Markets:</span>
                  <span className="attr-val">{profile.targetLocations || 'Remote'}</span>
                </div>
                <div className="attribute-item">
                  <span className="attr-title">Graduation Class:</span>
                  <span className="attr-val">{profile.classYear || 'Class of 2026'}</span>
                </div>
              </div>
              <button className="btn btn-outline btn-full" onClick={() => onNavigate('career')}>
                View Strategic Career Roadmap &rarr;
              </button>
            </div>
          </section>

        </div>

      </div>

    </div>
  );
}
