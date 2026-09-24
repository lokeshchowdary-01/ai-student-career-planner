/**
 * Centralized API and Authentication configuration.
 * Reads VITE_API_BASE_URL from environment variables for production deployments,
 * defaulting to http://127.0.0.1:8000 for local development.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const TOKEN_KEY = 'learnorbit_auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (err) {
    console.error('Failed to update localStorage auth token:', err);
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    console.error('Failed to clear auth token:', err);
  }
}

export function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function authFetch(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers
  });
}

// 1. Today's Plan API
export async function getTodayPlan() {
  const res = await authFetch(`${API_BASE_URL}/api/today-plan`);
  if (!res.ok) throw new Error('Failed to load today\'s plan');
  return res.json();
}

export async function generateTodayPlan(availableMinutes, forceRegenerate = false) {
  const res = await authFetch(`${API_BASE_URL}/api/today-plan/generate`, {
    method: 'POST',
    body: JSON.stringify({ available_minutes: availableMinutes, force_regenerate: forceRegenerate })
  });
  if (!res.ok) throw new Error('Failed to generate today\'s plan');
  return res.json();
}

export async function updateTodayTask(taskId, status, minutesSpent = null) {
  const payload = { status };
  if (minutesSpent) payload.minutes_spent = minutesSpent;
  const res = await authFetch(`${API_BASE_URL}/api/today-tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function replaceTodayTask(taskId) {
  const res = await authFetch(`${API_BASE_URL}/api/today-tasks/${taskId}/replace`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to replace task');
  return res.json();
}

// 2. Career Skill Assessment API
export async function getAssessmentQuestions(roleId = null) {
  const url = roleId ? `${API_BASE_URL}/api/assessments/questions?role_id=${roleId}` : `${API_BASE_URL}/api/assessments/questions`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to load assessment questions');
  return res.json();
}

export async function submitAssessment(roleId, answers, confidenceRating = 'Medium') {
  const res = await authFetch(`${API_BASE_URL}/api/assessments/submit`, {
    method: 'POST',
    body: JSON.stringify({ role_id: roleId, confidence_rating: confidenceRating, answers })
  });
  if (!res.ok) throw new Error('Failed to submit assessment');
  return res.json();
}

export async function getAssessmentHistory(roleId = null) {
  const url = roleId ? `${API_BASE_URL}/api/assessments/history?role_id=${roleId}` : `${API_BASE_URL}/api/assessments/history`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to load assessment history');
  return res.json();
}

// 3. Evidence-Based Skill Profile API
export async function getSkillsEvidence() {
  const res = await authFetch(`${API_BASE_URL}/api/skills/evidence`);
  if (!res.ok) throw new Error('Failed to load skills evidence');
  return res.json();
}

// 4. Project-Based Learning Hub API
export async function getProjects() {
  const res = await authFetch(`${API_BASE_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}

export async function createProject(projectData) {
  const res = await authFetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    body: JSON.stringify(projectData)
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function updateProject(projectId, projectData) {
  const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(projectData)
  });
  if (!res.ok) throw new Error('Failed to update project');
  return res.json();
}

export async function deleteProject(projectId) {
  const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete project');
  return res.json();
}

export async function toggleProjectMilestone(projectId, milestoneId, completed) {
  const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}/milestones/${milestoneId}`, {
    method: 'PUT',
    body: JSON.stringify({ completed })
  });
  if (!res.ok) throw new Error('Failed to update project milestone');
  return res.json();
}

export async function generateAiProject() {
  const res = await authFetch(`${API_BASE_URL}/api/projects/ai-generate`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to generate AI project blueprint');
  return res.json();
}

// 5. Career Preparation Dashboard API
export async function getCareerPreparation() {
  const res = await authFetch(`${API_BASE_URL}/api/career-preparation`);
  if (!res.ok) throw new Error('Failed to load career preparation metrics');
  return res.json();
}

export async function getCareerGapAnalysis(roleId = null) {
  const url = roleId ? `${API_BASE_URL}/api/career-gap-analysis?role_id=${roleId}` : `${API_BASE_URL}/api/career-gap-analysis`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to load gap analysis');
  return res.json();
}


