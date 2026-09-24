import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL, authFetch } from '../apiConfig';

/**
 * Learning Planner View (Step 3 + Step 4)
 * Features:
 * - Dynamic personalized learning roadmap connected to /api/learning-roadmap
 * - Real-time milestone status toggle via PUT /api/learning-milestones/{id}
 * - Curated learning resources for each missing skill
 * - Study Streak & 12-Week Activity Heatmap connected to GET /api/study-activity
 * - Interactive "Log Study Session" form calling POST /api/study-activity
 */
export default function LearningPlannerView({
  onNavigate = () => {},
  showToast = () => {}
}) {
  // Navigation tabs: 'roadmap' | 'activity' | 'all'
  const [activeTab, setActiveTab] = useState('roadmap');

  // Roadmap State
  const [roadmap, setRoadmap] = useState(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(true);
  const [roadmapError, setRoadmapError] = useState(null);
  const [updatingMilestoneId, setUpdatingMilestoneId] = useState(null);

  // Study Activity & Streak State
  const [studyData, setStudyData] = useState(null);
  const [loadingStudy, setLoadingStudy] = useState(true);
  const [studyError, setStudyError] = useState(null);

  // Log Study Session Form State
  const [minutesStudied, setMinutesStudied] = useState(60);
  const [activitiesCompleted, setActivitiesCompleted] = useState(1);
  const [focusArea, setFocusArea] = useState('');
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loggingSession, setLoggingSession] = useState(false);

  // Selected Day on Heatmap
  const [selectedDay, setSelectedDay] = useState(null);

  // Fetch Roadmap from FastAPI
  const fetchRoadmapData = useCallback(async () => {
    setLoadingRoadmap(true);
    setRoadmapError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/learning-roadmap`);
      if (!res.ok) {
        throw new Error(`Failed to load learning roadmap (HTTP ${res.status})`);
      }
      const data = await res.json();
      setRoadmap(data);
    } catch (err) {
      console.error('Roadmap fetch error:', err);
      setRoadmapError(err.message);
    } finally {
      setLoadingRoadmap(false);
    }
  }, []);

  // Fetch Study Activity & Streak Data from FastAPI
  const fetchStudyActivity = useCallback(async () => {
    setLoadingStudy(true);
    setStudyError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/study-activity`);
      if (!res.ok) {
        throw new Error(`Failed to load study activity (HTTP ${res.status})`);
      }
      const data = await res.json();
      setStudyData(data);
      // Default selected day to today if found in recent activities
      if (data.recent_activities && data.recent_activities.length > 0) {
        setSelectedDay(data.recent_activities[0]);
      }
    } catch (err) {
      console.error('Study activity fetch error:', err);
      setStudyError(err.message);
    } finally {
      setLoadingStudy(false);
    }
  }, []);

  useEffect(() => {
    fetchRoadmapData();
    fetchStudyActivity();
  }, [fetchRoadmapData, fetchStudyActivity]);

  // Handle milestone completion toggle
  const handleToggleMilestone = async (milestoneId, currentCompleted) => {
    const newStatus = !currentCompleted;
    setUpdatingMilestoneId(milestoneId);

    // Optimistic local update
    setRoadmap(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        roadmap_steps: prev.roadmap_steps.map(step => ({
          ...step,
          milestones: step.milestones.map(m =>
            m.id === milestoneId ? { ...m, completed: newStatus } : m
          )
        }))
      };
    });

    try {
      const res = await authFetch(`${API_BASE_URL}/api/learning-milestones/${milestoneId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: newStatus })
      });

      if (!res.ok) {
        throw new Error(`Failed to update milestone (HTTP ${res.status})`);
      }

      showToast(
        newStatus ? 'Milestone completed! Keep up the momentum.' : 'Milestone marked as pending.',
        newStatus ? 'success' : 'info'
      );
    } catch (err) {
      console.error('Failed to toggle milestone:', err);
      showToast('Error updating milestone in database.', 'error');
      fetchRoadmapData();
    } finally {
      setUpdatingMilestoneId(null);
    }
  };

  // Handle Log Study Session Submit
  const handleLogSession = async (e) => {
    e.preventDefault();
    if (Number(minutesStudied) <= 0) {
      showToast('Please enter valid study minutes (>= 1).', 'error');
      return;
    }

    setLoggingSession(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/study-activity`, {
        method: 'POST',
        body: JSON.stringify({
          minutes_spent: Number(minutesStudied),
          activities_completed: Number(activitiesCompleted),
          focus_area: focusArea.trim() || 'Core Engineering Study',
          activity_date: sessionDate || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to log session (${res.status})`);
      }

      const newRecord = await res.json();
      showToast(`Study session logged! +${minutesStudied} mins recorded 🔥`, 'success');
      setSelectedDay(newRecord);
      // Reset form fields
      setFocusArea('');
      // Refresh streak metrics and heatmap from API
      await fetchStudyActivity();
    } catch (err) {
      console.error('Session logging error:', err);
      showToast(err.message || 'Failed to record study session', 'error');
    } finally {
      setLoggingSession(false);
    }
  };

  // 12-Week Heatmap Computation
  const heatmapData = useMemo(() => {
    const activityMap = {};
    if (studyData?.recent_activities && Array.isArray(studyData.recent_activities)) {
      studyData.recent_activities.forEach(act => {
        const dateKey = typeof act.activity_date === 'string'
          ? act.activity_date.split('T')[0]
          : new Date(act.activity_date).toISOString().split('T')[0];
        activityMap[dateKey] = act;
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 0 = Monday, ..., 6 = Sunday
    const currentDayOfWeek = (today.getDay() + 6) % 7;

    // End on Sunday of current week
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - currentDayOfWeek));

    // 12 weeks = 84 days total
    const startDate = new Date(endOfWeek);
    startDate.setDate(endOfWeek.getDate() - 83);

    const weeks = [];
    const monthLabels = [];
    let lastMonth = -1;

    for (let w = 0; w < 12; w++) {
      const days = [];
      const mondayOfThisWeek = new Date(startDate);
      mondayOfThisWeek.setDate(startDate.getDate() + (w * 7));

      const monthIndex = mondayOfThisWeek.getMonth();
      const monthName = mondayOfThisWeek.toLocaleString('en-US', { month: 'short' });

      if (monthIndex !== lastMonth) {
        monthLabels.push({ weekIndex: w, label: monthName });
        lastMonth = monthIndex;
      }

      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + (w * 7 + d));
        cellDate.setHours(0, 0, 0, 0);

        const yyyy = cellDate.getFullYear();
        const mm = String(cellDate.getMonth() + 1).padStart(2, '0');
        const dd = String(cellDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const isFuture = cellDate > today;
        const isToday = cellDate.getTime() === today.getTime();
        const act = activityMap[dateStr];
        const minutes = act ? act.minutes_spent : 0;
        const completed = act ? act.activities_completed : 0;
        const focus = act ? act.focus_area : null;

        let level = 'level-0';
        if (isFuture) {
          level = 'level-future';
        } else if (minutes > 90) {
          level = 'level-4';
        } else if (minutes > 60) {
          level = 'level-3';
        } else if (minutes > 30) {
          level = 'level-2';
        } else if (minutes > 0) {
          level = 'level-1';
        }

        days.push({
          dateStr,
          displayDate: cellDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          minutes,
          completed,
          focus,
          level,
          isFuture,
          isToday
        });
      }

      weeks.push({ weekIndex: w, days });
    }

    return { weeks, monthLabels, activityMap };
  }, [studyData]);

  // Calculate total curriculum hours
  const totalHours = roadmap?.roadmap_steps
    ? roadmap.roadmap_steps.reduce((acc, step) => acc + (step.estimated_hours || 0), 0)
    : 0;

  const currentStreak = studyData?.current_streak_days ?? 0;

  return (
    <div className="page-content-wrapper">
      
      {/* Banner Header */}
      <div className="view-header-banner">
        <div className="view-header-text">
          <h1>Personalized Learning Planner</h1>
          <p>
            Curriculum roadmap dynamically generated from your active career skill gaps, reinforced by study streak habit analytics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            id="refresh-all-btn"
            className="btn btn-outline"
            onClick={() => {
              fetchRoadmapData();
              fetchStudyActivity();
            }}
            title="Refresh roadmap and study activity from PostgreSQL"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            <span>Refresh All</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('career')}
            title="Switch target career role"
          >
            <span>Change Target Track &rarr;</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="planner-tabs-bar">
        <button
          className={`planner-tab-btn ${activeTab === 'roadmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('roadmap')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
          </svg>
          <span>Curriculum Roadmap {roadmap?.roadmap_steps ? `(${roadmap.roadmap_steps.length} Steps)` : ''}</span>
        </button>

        <button
          className={`planner-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
          </svg>
          <span>Study Streak & Heatmap {currentStreak > 0 ? `(${currentStreak}d 🔥)` : ''}</span>
        </button>

        <button
          className={`planner-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span>Complete Overview</span>
        </button>
      </div>

      {/* =========================================================================
          SECTION 1: STUDY STREAK & HEATMAP (Active if tab is 'activity' or 'all')
          ========================================================================= */}
      {(activeTab === 'activity' || activeTab === 'all') && (
        <div style={{ marginBottom: '2rem' }}>
          
          {/* Loading / Error for Study Activity */}
          {loadingStudy && (
            <div className="empty-state-panel" style={{ padding: '2rem', textAlign: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Loading study activity records from PostgreSQL...</span>
            </div>
          )}

          {studyError && !loadingStudy && (
            <div className="empty-state-panel" style={{ borderColor: 'var(--accent-rose)', margin: '1rem 0' }}>
              <p style={{ color: 'var(--accent-rose)', fontWeight: '600' }}>Error: {studyError}</p>
            </div>
          )}

          {studyData && !loadingStudy && (
            <>
              {/* 5 Streak KPI Metric Cards */}
              <div className="streak-kpi-grid">
                
                {/* 1. Current Streak */}
                <div className="streak-kpi-card" style={{ borderLeft: '3px solid var(--accent-amber)' }}>
                  <span className="streak-kpi-label">
                    <span>🔥</span> Current Streak
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span className="streak-kpi-number" style={{ color: 'var(--accent-amber)' }}>
                      {studyData.current_streak_days}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      {studyData.current_streak_days === 1 ? 'Day' : 'Days'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--accent-emerald)', fontWeight: '600' }}>
                    {studyData.current_streak_days > 0 ? 'Active Streak Live' : 'Start your streak today!'}
                  </span>
                </div>

                {/* 2. Longest Streak */}
                <div className="streak-kpi-card" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                  <span className="streak-kpi-label">
                    <span>⚡</span> Longest Streak
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span className="streak-kpi-number" style={{ color: 'var(--accent-purple)' }}>
                      {studyData.longest_streak_days}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      Days
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    Personal Record
                  </span>
                </div>

                {/* 3. Total Study Days */}
                <div className="streak-kpi-card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
                  <span className="streak-kpi-label">
                    <span>📅</span> Total Study Days
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span className="streak-kpi-number" style={{ color: 'var(--accent-blue)' }}>
                      {studyData.total_days}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      Days
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    Consistent Logged Days
                  </span>
                </div>

                {/* 4. Total Study Hours */}
                <div className="streak-kpi-card" style={{ borderLeft: '3px solid var(--accent-emerald)' }}>
                  <span className="streak-kpi-label">
                    <span>⏱️</span> Total Study Hours
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span className="streak-kpi-number" style={{ color: 'var(--accent-emerald)' }}>
                      {studyData.total_hours}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      Hours
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    {studyData.total_minutes} Total Minutes
                  </span>
                </div>

                {/* 5. Total Activities Completed */}
                <div className="streak-kpi-card" style={{ borderLeft: '3px solid var(--accent-rose)' }}>
                  <span className="streak-kpi-label">
                    <span>🎯</span> Tasks Completed
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                    <span className="streak-kpi-number" style={{ color: 'var(--accent-rose)' }}>
                      {studyData.total_activities_completed}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                      Tasks
                    </span>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    Curriculum Milestones
                  </span>
                </div>

              </div>

              {/* 12-Week Interactive Heatmap Card */}
              <div className="heatmap-card">
                <div className="panel-header" style={{ marginBottom: '0.5rem' }}>
                  <div className="panel-title-wrap">
                    <div className="badge-dot dot-emerald"></div>
                    <h2>12-Week Study Activity Heatmap</h2>
                  </div>
                  <span className="status-badge status-completed">
                    {studyData.total_days} Active Sessions in PostgreSQL
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Visual log of daily engineering study sessions over the past 12 weeks. Hover or click any day to view session details.
                </p>

                {/* Heatmap Grid Container */}
                <div className="heatmap-scroll-wrap">
                  <div className="heatmap-inner">
                    
                    {/* Months Row */}
                    <div className="heatmap-months-row">
                      {heatmapData.monthLabels.map((m, idx) => (
                        <div
                          key={idx}
                          className="heatmap-month-label"
                          style={{ width: `${(12 / heatmapData.monthLabels.length) * 19}px` }}
                        >
                          {m.label}
                        </div>
                      ))}
                    </div>

                    {/* Main Heatmap Row (Days of Week + 12 Week Columns) */}
                    <div className="heatmap-main-row">
                      
                      {/* Left Days-of-Week Labels */}
                      <div className="heatmap-days-labels">
                        <span>Mon</span>
                        <span>Wed</span>
                        <span>Fri</span>
                        <span>Sun</span>
                      </div>

                      {/* 12-Week Columns */}
                      <div className="heatmap-weeks-grid">
                        {heatmapData.weeks.map(week => (
                          <div key={week.weekIndex} className="heatmap-week-col">
                            {week.days.map(day => {
                              const isSelected = selectedDay && (
                                (selectedDay.activity_date === day.dateStr) ||
                                (selectedDay.dateStr === day.dateStr)
                              );

                              return (
                                <div
                                  key={day.dateStr}
                                  className={`heatmap-cell ${day.level}`}
                                  style={isSelected ? { outline: '2px solid var(--accent-purple)', transform: 'scale(1.3)', zIndex: 15 } : {}}
                                  onClick={() => {
                                    if (!day.isFuture) {
                                      setSelectedDay(day);
                                    }
                                  }}
                                  title={`${day.displayDate}: ${day.minutes > 0 ? `${day.minutes} mins (${day.completed} tasks) • ${day.focus || 'Study'}` : 'No study logged'}`}
                                ></div>
                              );
                            })}
                          </div>
                        ))}
                      </div>

                    </div>

                    {/* Heatmap Footer Row: Legend & Selected Day Info */}
                    <div className="heatmap-footer-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>Click any day to inspect details.</span>
                      </div>

                      <div className="heatmap-legend">
                        <span>Less</span>
                        <div className="heatmap-legend-cell heatmap-cell level-0" title="0 mins"></div>
                        <div className="heatmap-legend-cell heatmap-cell level-1" title="1-30 mins"></div>
                        <div className="heatmap-legend-cell heatmap-cell level-2" title="31-60 mins"></div>
                        <div className="heatmap-legend-cell heatmap-cell level-3" title="61-90 mins"></div>
                        <div className="heatmap-legend-cell heatmap-cell level-4" title=">90 mins"></div>
                        <span>More</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Selected Day Details Preview Box */}
                {selectedDay && (
                  <div className="heatmap-selected-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="badge-dot dot-emerald"></span>
                      <div>
                        <strong>
                          {selectedDay.displayDate || selectedDay.activity_date}
                        </strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                          Focus: <strong>{selectedDay.focus || selectedDay.focus_area || 'General Study & Practice'}</strong>
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="status-badge status-completed">
                        {selectedDay.minutes || selectedDay.minutes_spent || 0} Minutes Logged
                        {selectedDay.completed || selectedDay.activities_completed ? ` • ${selectedDay.completed || selectedDay.activities_completed} Tasks` : ''}
                      </span>
                    </div>
                  </div>
                )}

              </div>

              {/* Log Study Session Form Panel */}
              <div className="log-session-card">
                <div className="panel-header" style={{ marginBottom: '0.25rem' }}>
                  <div className="panel-title-wrap">
                    <div className="badge-dot dot-purple"></div>
                    <h2>Log Study Session</h2>
                  </div>
                  <span className="status-badge status-in-progress">
                    Instant Habit Tracking
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Record minutes invested in technical study, coding labs, or projects to keep your consecutive daily streak growing.
                </p>

                <form onSubmit={handleLogSession} className="log-session-form-grid">
                  
                  {/* Field 1: Minutes Studied */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="input-study-mins">Minutes Studied *</label>
                    <input
                      type="number"
                      id="input-study-mins"
                      min="1"
                      max="720"
                      required
                      value={minutesStudied}
                      onChange={(e) => setMinutesStudied(e.target.value)}
                      placeholder="e.g. 60"
                    />
                  </div>

                  {/* Field 2: Activities Completed */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="input-study-tasks">Tasks Completed</label>
                    <input
                      type="number"
                      id="input-study-tasks"
                      min="1"
                      max="50"
                      value={activitiesCompleted}
                      onChange={(e) => setActivitiesCompleted(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>

                  {/* Field 3: Focus Area */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="input-study-focus">Focus Area / Topic</label>
                    <input
                      type="text"
                      id="input-study-focus"
                      value={focusArea}
                      onChange={(e) => setFocusArea(e.target.value)}
                      placeholder="e.g. FastAPI, PostgreSQL, Docker..."
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    id="submit-study-session-btn"
                    className="btn btn-primary"
                    disabled={loggingSession}
                    style={{ height: '42px', alignSelf: 'flex-end' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    <span>{loggingSession ? 'Saving...' : 'Log Session'}</span>
                  </button>

                </form>
              </div>

            </>
          )}

        </div>
      )}

      {/* =========================================================================
          SECTION 2: CURRICULUM ROADMAP (Active if tab is 'roadmap' or 'all')
          ========================================================================= */}
      {(activeTab === 'roadmap' || activeTab === 'all') && (
        <>
          {/* Quick Streak Bar on Roadmap View */}
          {activeTab === 'roadmap' && studyData && (
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-card)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('activity')}
              title="Click to view 12-week heatmap & log study session"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🔥</span>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Daily Study Streak: {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'} Active
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    • {studyData.total_hours} hrs logged across {studyData.total_days} study days
                  </span>
                </div>
              </div>
              <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setActiveTab('activity'); }}>
                View Heatmap &rarr;
              </button>
            </div>
          )}

          {/* Loading State for Roadmap */}
          {loadingRoadmap && (
            <div className="empty-state-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <div className="badge-dot dot-blue" style={{ width: '14px', height: '14px', margin: '0 auto 1rem' }}></div>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Generating Personalized Roadmap...
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Analyzing verified PostgreSQL skill gaps, calculating weighted projected readiness, and attaching curated resources.
              </p>
            </div>
          )}

          {/* Error State for Roadmap */}
          {!loadingRoadmap && roadmapError && (
            <div className="empty-state-panel" style={{ borderColor: 'var(--accent-rose)', margin: '1rem 0' }}>
              <p style={{ color: 'var(--accent-rose)', fontWeight: '700' }}>
                Failed to load learning roadmap: {roadmapError}
              </p>
              <button className="btn btn-primary" onClick={fetchRoadmapData} style={{ marginTop: '0.75rem' }}>
                Try Again
              </button>
            </div>
          )}

          {/* Content Loaded */}
          {!loadingRoadmap && !roadmapError && roadmap && (
            <>
              {/* Summary KPI Cards Grid */}
              <div className="planner-kpi-grid">
                
                {/* Card 1: Active Target Role */}
                <div className="planner-kpi-card">
                  <div>
                    <span className="planner-kpi-title">Active Career Target</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: '1.3' }}>
                        {roadmap.role_name}
                      </h3>
                      <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                        {roadmap.role_description ? `${roadmap.role_description.slice(0, 80)}...` : 'Focusing on production architectures and modern systems.'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="status-badge status-completed" style={{ fontSize: '0.7rem' }}>
                      PostgreSQL Synced
                    </span>
                  </div>
                </div>

                {/* Card 2: Current Readiness */}
                <div className="planner-kpi-card">
                  <div>
                    <span className="planner-kpi-title">Current Readiness</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <span className="planner-kpi-value" style={{ color: roadmap.current_readiness_percentage >= 50 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                        {roadmap.current_readiness_percentage}%
                      </span>
                      <div className="milestone-progress-bar-wrap" style={{ height: '8px', margin: '0.5rem 0' }}>
                        <div
                          className="milestone-progress-bar"
                          style={{ width: `${roadmap.current_readiness_percentage}%` }}
                        ></div>
                      </div>
                      <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                        Based on your verified skills
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="status-badge status-in-progress" style={{ fontSize: '0.7rem' }}>
                      Live Score
                    </span>
                  </div>
                </div>

                {/* Card 3: Projected Maximum Readiness */}
                <div className="planner-kpi-card">
                  <div>
                    <span className="planner-kpi-title">Target Potential</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <span className="planner-kpi-value" style={{ color: 'var(--accent-emerald)' }}>
                        {roadmap.projected_max_readiness}%
                      </span>
                      <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                        Achieved when all {roadmap.total_missing_skills} roadmap steps are completed.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="status-badge status-completed" style={{ fontSize: '0.7rem' }}>
                      100% Target Alignment
                    </span>
                  </div>
                </div>

                {/* Card 4: Roadmap Steps & Estimated Hours */}
                <div className="planner-kpi-card">
                  <div>
                    <span className="planner-kpi-title">Curriculum Scope</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <span className="planner-kpi-value" style={{ color: 'var(--accent-purple)' }}>
                        {roadmap.total_roadmap_steps} Steps
                      </span>
                      <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                        ~{totalHours} Estimated Total Hours
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="status-badge status-under-review" style={{ fontSize: '0.7rem' }}>
                      Prioritized Sequence
                    </span>
                  </div>
                </div>

              </div>

              {/* Roadmap Steps Container */}
              <section className="content-panel">
                <div className="panel-header">
                  <div className="panel-title-wrap">
                    <div className="badge-dot dot-purple"></div>
                    <h2>Personalized Learning Steps ({roadmap.roadmap_steps.length})</h2>
                  </div>
                  <span className="status-badge status-completed">
                    Prioritized by Weight & Core Architecture
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  Each step below focuses on a missing required competency for <strong>{roadmap.role_name}</strong>. Complete the milestones and review the curated resources to boost your career readiness score.
                </p>

                {roadmap.roadmap_steps.length === 0 ? (
                  <div className="empty-state-panel" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--accent-emerald)', fontSize: '1rem', fontWeight: '700' }}>
                      🎉 All required competencies for this specialization are already in your portfolio!
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                      Your readiness is at maximum. Switch to another specialization on the Career Goal page to explore other tracks.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {roadmap.roadmap_steps.map((step) => (
                      <article key={step.step_number} className="roadmap-step-card">
                        
                        {/* Step Header */}
                        <div className="roadmap-step-header">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                              <span className="step-badge">Step {step.step_number}</span>
                              <span className={`status-badge ${step.importance === 'Core' ? 'status-in-progress' : 'status-completed'}`}>
                                {step.importance} Requirement
                              </span>
                              <span className="tech-tag" style={{ fontSize: '0.725rem' }}>
                                {step.category}
                              </span>
                            </div>
                            <h3 className="step-skill-title">
                              {step.skill_name}
                            </h3>
                          </div>

                          {/* Right: Projected Gain & Readiness Metrics */}
                          <div className="step-gain-tags">
                            <span className="step-gain-badge">
                              +{step.projected_gain_percentage}% Readiness Gain
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                              Cumulative: {step.cumulative_readiness}%
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              ⏱ ~{step.estimated_hours} hrs
                            </span>
                          </div>
                        </div>

                        {/* Step Body: 2 Columns (Resources on Left, Milestones on Right) */}
                        <div className="step-sections-grid">
                          
                          {/* Column 1: Curated Learning Resources */}
                          <div className="step-section-box">
                            <div className="step-section-heading">
                              <span>📚 Curated Resources ({step.resources.length})</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Direct Links</span>
                            </div>

                            {step.resources.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {step.resources.map((res) => (
                                  <a
                                    key={res.id}
                                    href={res.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="planner-resource-chip"
                                    title={`Open ${res.title}`}
                                  >
                                    <div className="planner-resource-title">
                                      <span>{res.title}</span>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                      </svg>
                                    </div>
                                    <div className="planner-resource-meta">
                                      <span className="tech-tag" style={{ fontSize: '0.675rem', padding: '0.15rem 0.4rem' }}>
                                        {res.resource_type}
                                      </span>
                                      <span>Difficulty: <strong>{res.difficulty}</strong></span>
                                      <span>• ~{res.estimated_hours} hrs</span>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Standard technical documentation available. Practice by building a hands-on project utilizing <strong>{step.skill_name}</strong>.
                              </p>
                            )}
                          </div>

                          {/* Column 2: Associated Milestones */}
                          <div className="step-section-box">
                            <div className="step-section-heading">
                              <span>🎯 Target Milestones ({step.milestones.length})</span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click to Toggle</span>
                            </div>

                            {step.milestones.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {step.milestones.map((m) => {
                                  const isCompleted = m.completed;
                                  return (
                                    <div
                                      key={m.id}
                                      className={`milestone-item ${isCompleted ? 'completed planner-completed' : 'planner-pending'}`}
                                      onClick={() => handleToggleMilestone(m.id, isCompleted)}
                                      style={{
                                        cursor: updatingMilestoneId === m.id ? 'wait' : 'pointer',
                                        opacity: updatingMilestoneId === m.id ? 0.7 : 1
                                      }}
                                    >
                                      <div className="milestone-left">
                                        <input
                                          type="checkbox"
                                          id={`chk-step-${m.id}`}
                                          className="custom-checkbox"
                                          checked={isCompleted}
                                          onChange={() => {}}
                                          aria-label={m.title}
                                        />
                                        <label
                                          htmlFor={`chk-step-${m.id}`}
                                          className="milestone-label"
                                          style={{
                                            cursor: 'pointer',
                                            fontWeight: isCompleted ? '400' : '600'
                                          }}
                                        >
                                          {m.title}
                                        </label>
                                      </div>

                                      <span
                                        className={`status-badge ${isCompleted ? 'status-completed' : 'status-under-review'}`}
                                        style={{ fontSize: '0.675rem', flexShrink: 0 }}
                                      >
                                        {isCompleted ? '✓ Done' : 'Pending'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Once you have completed study for <strong>{step.skill_name}</strong>, add it to your <strong>My Skills</strong> portfolio to verify competency.
                              </p>
                            )}
                          </div>

                        </div>

                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

    </div>
  );
}
