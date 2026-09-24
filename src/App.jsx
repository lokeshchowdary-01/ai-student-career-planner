import React, { useState, useEffect } from 'react';
import { INITIAL_DATA } from './data/initialData';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import DashboardView from './pages/DashboardView';
import SkillsView from './pages/SkillsView';
import ProjectsView from './pages/ProjectsView';
import LearningProgressView from './pages/LearningProgressView';
import LearningPlannerView from './pages/LearningPlannerView';
import CareerGoalView from './pages/CareerGoalView';
import { EditProfileModal, AddSkillModal, EditSkillModal, AddProjectModal } from './components/Modals';
import AuthModal from './components/AuthModal';
import AIChatDrawer from './components/AIChatDrawer';
import AssessmentModal from './components/AssessmentModal';
import { API_BASE_URL, getAuthToken, clearAuthToken, authFetch, getProjects, createProject, deleteProject } from './apiConfig';

/**
 * Main Application Shell
 * Features:
 * - Full Authentication (Login, Register, Session Restoration, Logout)
 * - Multi-tenant PostgreSQL database synchronization
 * - State management with localStorage persistence
 * - URL Hash-based beginner-friendly React navigation
 * - 6 Page views (Dashboard, My Skills, My Projects, Learning Progress, Learning Planner, Career Goal)
 * - Dark & Light Theme system
 * - Toast feedback system
 */
export default function App() {
  // Authentication State
  const [authToken, setAuthTokenState] = useState(() => getAuthToken());
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');

  // Load initial profile from localStorage or fallback
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('learnorbit_profile');
      const parsed = saved ? JSON.parse(saved) : INITIAL_DATA.profile;
      const activeAvatar = localStorage.getItem('learnorbit_avatar_active');
      return {
        ...parsed,
        avatar: activeAvatar || parsed.avatar || null
      };
    } catch {
      return INITIAL_DATA.profile;
    }
  });

  // Skills state fetched from FastAPI backend
  const [skills, setSkills] = useState([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState(null);

  const [projects, setProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('learnorbit_projects');
      return saved ? JSON.parse(saved) : INITIAL_DATA.projects;
    } catch {
      return INITIAL_DATA.projects;
    }
  });

  const [milestones, setMilestones] = useState(() => {
    try {
      const saved = localStorage.getItem('learnorbit_milestones');
      return saved ? JSON.parse(saved) : INITIAL_DATA.milestones;
    } catch {
      return INITIAL_DATA.milestones;
    }
  });

  // Navigation State: 'dashboard' | 'skills' | 'projects' | 'learning' | 'planner' | 'career'
  const [activePage, setActivePage] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    const validPages = ['dashboard', 'skills', 'projects', 'learning', 'planner', 'career'];
    return validPages.includes(hash) ? hash : 'dashboard';
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('learnorbit_theme') || 'light';
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  // Modals state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Toast helper
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Restore authenticated session from /api/auth/me on load
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      authFetch(`${API_BASE_URL}/api/auth/me`)
        .then(res => {
          if (res.ok) return res.json();
          clearAuthToken();
          setAuthTokenState(null);
          setCurrentUser(null);
          return null;
        })
        .then(userData => {
          if (userData) {
            setCurrentUser(userData);
            const userKey = `user_${userData.id}`;
            const savedAvatar = localStorage.getItem(`learnorbit_avatar_${userKey}`) 
              || localStorage.getItem(`learnorbit_avatar_email_${userData.email}`);
            const savedUserData = localStorage.getItem(`learnorbit_profile_${userKey}`);
            let extra = {};
            if (savedUserData) {
              try { extra = JSON.parse(savedUserData); } catch {}
            }
            setProfile(prev => ({
              ...prev,
              name: userData.name,
              email: userData.email,
              avatar: savedAvatar || prev.avatar || null,
              ...extra
            }));
          }
        })
        .catch(() => {
          clearAuthToken();
          setAuthTokenState(null);
          setCurrentUser(null);
        });
    }
  }, [authToken]);

  // Reusable function to fetch skills from FastAPI backend
  const fetchSkills = () => {
    setSkillsLoading(true);
    setSkillsError(null);

    authFetch(`${API_BASE_URL}/api/skills`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setSkills(data);
        setSkillsLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch skills from FastAPI backend:', err);
        setSkillsError(err.message);
        setSkillsLoading(false);
      });
  };

  // Fetch active career goal from PostgreSQL
  const fetchCareerGoal = () => {
    authFetch(`${API_BASE_URL}/api/career-goal`)
      .then(res => (res.ok ? res.json() : null))
      .then(goal => {
        if (goal) {
          setProfile(prev => ({
            ...prev,
            careerRoleId: goal.career_role_id,
            name: goal.student_name || prev.name,
            careerGoal: goal.role_name || prev.careerGoal,
            goalDesc: goal.role_description || prev.goalDesc,
            targetDate: goal.target_date || prev.targetDate,
            targetIndustries: goal.target_industries || prev.targetIndustries,
            targetLocations: goal.target_locations || prev.targetLocations,
          }));
        }
      })
      .catch(err => console.error('Failed to sync career goal:', err));
  };

  // Fetch projects from PostgreSQL
  const fetchProjects = () => {
    getProjects()
      .then(data => {
        if (data && Array.isArray(data)) {
          setProjects(data);
        }
      })
      .catch(err => {
        console.warn('Failed to sync projects from PostgreSQL:', err);
      });
  };

  // Fetch skills, career goal, and projects on load and whenever active user changes
  useEffect(() => {
    fetchSkills();
    fetchCareerGoal();
    fetchProjects();
  }, [currentUser]);

  // Sync theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('learnorbit_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    showToast(`Switched to ${theme === 'dark' ? 'light' : 'dark'} theme`, 'info');
  };

  // Save changes to localStorage (profile, projects, milestones)
  useEffect(() => {
    localStorage.setItem('learnorbit_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('learnorbit_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('learnorbit_milestones', JSON.stringify(milestones));
  }, [milestones]);

  // Sync navigation with browser URL hash
  useEffect(() => {
    window.location.hash = activePage;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePage]);

  // Listen for browser back / forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validPages = ['dashboard', 'skills', 'projects', 'learning', 'planner', 'career'];
      if (validPages.includes(hash)) {
        setActivePage(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Recalculate learning progress percentage dynamically
  const completedCount = milestones.filter(m => m.completed).length;
  const learningPercentage = milestones.length > 0
    ? Math.round((completedCount / milestones.length) * 100)
    : 0;

  // Handlers
  const handleSaveProfile = (updatedProfile) => {
    setProfile(updatedProfile);
    const userKey = currentUser?.id ? `user_${currentUser.id}` : (currentUser?.email ? `email_${currentUser.email}` : 'active');
    if (updatedProfile.avatar) {
      localStorage.setItem(`learnorbit_avatar_${userKey}`, updatedProfile.avatar);
      localStorage.setItem('learnorbit_avatar_active', updatedProfile.avatar);
    }
    localStorage.setItem(`learnorbit_profile_${userKey}`, JSON.stringify({
      targetLocations: updatedProfile.targetLocations,
      classYear: updatedProfile.classYear,
      gpa: updatedProfile.gpa
    }));
  };

  const handleGoalUpdated = (updatedGoal) => {
    if (updatedGoal) {
      setProfile(prev => ({
        ...prev,
        careerRoleId: updatedGoal.career_role_id || prev.careerRoleId,
        careerGoal: updatedGoal.role_name || prev.careerGoal,
        goalDesc: updatedGoal.role_description || prev.goalDesc,
        targetDate: updatedGoal.target_date || prev.targetDate,
        targetIndustries: updatedGoal.target_industries || prev.targetIndustries,
        targetLocations: updatedGoal.target_locations || prev.targetLocations,
      }));
    }
  };

  // Authentication Handlers
  const handleOpenAuth = (mode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (data) => {
    setAuthTokenState(data.token);
    setCurrentUser(data.user);
    const userKey = `user_${data.user.id}`;
    const savedAvatar = localStorage.getItem(`learnorbit_avatar_${userKey}`) 
      || localStorage.getItem(`learnorbit_avatar_email_${data.user.email}`);
    const savedUserData = localStorage.getItem(`learnorbit_profile_${userKey}`);
    let extra = {};
    if (savedUserData) {
      try { extra = JSON.parse(savedUserData); } catch {}
    }
    setProfile(prev => ({
      ...prev,
      name: data.user.name,
      email: data.user.email,
      avatar: savedAvatar || null,
      ...extra
    }));
    fetchSkills();
    fetchCareerGoal();
  };

  const handleLogout = async () => {
    try {
      await authFetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' });
    } catch (err) {
      console.warn('Logout network error:', err);
    }
    clearAuthToken();
    setAuthTokenState(null);
    setCurrentUser(null);
    setProfile(INITIAL_DATA.profile);
    showToast('Signed out successfully.', 'info');
    setTimeout(() => {
      fetchSkills();
      fetchCareerGoal();
    }, 50);
  };

  // CRUD: Add Skill (POST to FastAPI & PostgreSQL)
  const handleAddSkill = async ({ name, category, level }) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/skills`, {
        method: 'POST',
        body: JSON.stringify({ name, category, level })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to create skill (${res.status})`);
      }
      const newSkill = await res.json();
      setSkills(prev => [...prev, newSkill]);
      showToast(`Skill '${newSkill.name}' saved to PostgreSQL!`, 'success');
    } catch (err) {
      console.error('Add skill error:', err);
      showToast(err.message, 'error');
    }
  };

  // CRUD: Edit Skill (PUT to FastAPI & PostgreSQL)
  const handleEditSkill = async (id, { name, category, level }) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/skills/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, category, level })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to update skill (${res.status})`);
      }
      const updatedSkill = await res.json();
      setSkills(prev => prev.map(s => String(s.id) === String(id) ? updatedSkill : s));
      showToast(`Skill '${updatedSkill.name}' updated in PostgreSQL!`, 'success');
    } catch (err) {
      console.error('Edit skill error:', err);
      showToast(err.message, 'error');
    }
  };

  // CRUD: Delete Skill (DELETE to FastAPI & PostgreSQL)
  const handleDeleteSkill = async (id) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/skills/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete skill (${res.status})`);
      }
      setSkills(prev => prev.filter(s => String(s.id) !== String(id)));
      showToast('Skill deleted from PostgreSQL!', 'info');
    } catch (err) {
      console.error('Delete skill error:', err);
      showToast(err.message, 'error');
    }
  };

  const handleAddProject = async (projectData) => {
    try {
      const tagList = Array.isArray(projectData.tags)
        ? projectData.tags
        : (typeof projectData.tags === 'string' ? projectData.tags.split(',').map(t => t.trim()).filter(Boolean) : ['General']);
      const payload = {
        title: projectData.title,
        description: projectData.desc || projectData.description || '',
        target_skills: tagList,
        difficulty: 'Intermediate',
        estimated_hours: 20.0,
        status: projectData.status || 'In Progress',
        github_url: projectData.link || ''
      };
      const created = await createProject(payload);
      setProjects(prev => [created, ...prev]);
      showToast(`Project '${created.title}' saved to PostgreSQL!`, 'success');
    } catch (err) {
      console.warn('Backend project creation fallback:', err);
      const newProject = {
        id: 'p_' + Date.now(),
        ...projectData
      };
      setProjects(prev => [newProject, ...prev]);
      showToast(`Project '${newProject.title}' created!`, 'success');
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      await deleteProject(id);
    } catch (err) {
      console.warn('Backend project delete fallback:', err);
    }
    const prj = projects.find(p => p.id === id);
    setProjects(prev => prev.filter(p => p.id !== id));
    showToast(`Project '${prj ? prj.title : ''}' removed.`, 'info');
  };

  const handleToggleMilestone = (id, isCompleted) => {
    setMilestones(prev =>
      prev.map(m => (m.id === id ? { ...m, completed: isCompleted } : m))
    );
    showToast('Learning milestone updated!', 'info');
  };

  const handleAddMilestone = (title, category) => {
    const newMilestone = {
      id: 'm_' + Date.now(),
      category: category || 'CS Core',
      title,
      completed: false
    };
    setMilestones(prev => [...prev, newMilestone]);
    showToast('New curriculum milestone added!', 'success');
  };

  const handleDeleteMilestone = (id) => {
    setMilestones(prev => prev.filter(m => m.id !== id));
    showToast('Milestone removed.', 'info');
  };

  const handleResetData = () => {
    if (window.confirm('Reset student profile, projects, and milestones to default values?')) {
      setProfile(INITIAL_DATA.profile);
      setProjects(INITIAL_DATA.projects);
      setMilestones(INITIAL_DATA.milestones);
      fetchSkills();
      showToast('Reset showcase data and refreshed skills.', 'info');
    }
  };

  const activeStudentName = currentUser ? currentUser.name : profile.name;

  return (
    <div className="app-frame">
      {/* Sidebar Navigation */}
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        skillsCount={skills.length}
        projectsCount={projects.length}
        learningPercentage={learningPercentage}
        studentName={activeStudentName}
        studentBadge={currentUser ? 'Verified Student' : profile.badge}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onOpenAiMentor={() => setIsAiDrawerOpen(true)}
        currentUser={currentUser}
        onOpenAuthModal={handleOpenAuth}
      />

      {/* Main Content Area */}
      <div className="app-main">
        <Navbar
          activePage={activePage}
          theme={theme}
          toggleTheme={toggleTheme}
          onOpenEditProfile={() => setIsProfileModalOpen(true)}
          onToggleMobileMenu={() => setMobileOpen(!mobileOpen)}
          onOpenAiMentor={() => setIsAiDrawerOpen(true)}
          currentUser={currentUser}
          onOpenAuthModal={handleOpenAuth}
          onLogout={handleLogout}
        />

        {/* Dynamic View Rendering Based on activePage */}
        <main>
          {activePage === 'dashboard' && (
            <DashboardView
              profile={{ ...profile, name: activeStudentName }}
              currentUser={currentUser}
              onUpdateProfile={handleSaveProfile}
              skills={skills}
              projects={projects}
              milestones={milestones}
              learningPercentage={learningPercentage}
              onNavigate={setActivePage}
              onOpenEditProfile={() => setIsProfileModalOpen(true)}
              onOpenAddSkill={() => setIsAddSkillModalOpen(true)}
              onOpenAddProject={() => setIsAddProjectModalOpen(true)}
              onToggleMilestone={handleToggleMilestone}
              onDeleteSkill={handleDeleteSkill}
              onDeleteProject={handleDeleteProject}
              onOpenAssessment={() => setIsAssessmentModalOpen(true)}
              showToast={showToast}
            />
          )}

          {activePage === 'skills' && (
            <SkillsView
              skills={skills}
              skillsLoading={skillsLoading}
              skillsError={skillsError}
              onOpenAddSkill={() => setIsAddSkillModalOpen(true)}
              onOpenEditSkill={(skill) => setEditingSkill(skill)}
              onDeleteSkill={handleDeleteSkill}
              onOpenAssessment={() => setIsAssessmentModalOpen(true)}
            />
          )}

          {activePage === 'projects' && (
            <ProjectsView
              projects={projects}
              onOpenAddProject={() => setIsAddProjectModalOpen(true)}
              onDeleteProject={handleDeleteProject}
              showToast={showToast}
            />
          )}

          {activePage === 'learning' && (
            <LearningProgressView
              milestones={milestones}
              learningPercentage={learningPercentage}
              onToggleMilestone={handleToggleMilestone}
              onAddMilestone={handleAddMilestone}
              onDeleteMilestone={handleDeleteMilestone}
            />
          )}

          {activePage === 'planner' && (
            <LearningPlannerView
              onNavigate={setActivePage}
              showToast={showToast}
            />
          )}

          {activePage === 'career' && (
            <CareerGoalView
              profile={{ ...profile, name: activeStudentName }}
              learningPercentage={learningPercentage}
              onOpenEditProfile={() => setIsProfileModalOpen(true)}
              showToast={showToast}
              onGoalUpdated={handleGoalUpdated}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-content">
            <p>LearnOrbit • Student Career & Skill Planner • Powered by FastAPI & PostgreSQL</p>
            <button
              onClick={handleResetData}
              className="text-link-danger"
              title="Reset showcase defaults"
            >
              Reset to Showcase Defaults
            </button>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        showToast={showToast}
      />

      <EditProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profile={{ ...profile, name: activeStudentName }}
        onSave={handleSaveProfile}
      />

      <AddSkillModal
        isOpen={isAddSkillModalOpen}
        onClose={() => setIsAddSkillModalOpen(false)}
        onAddSkill={handleAddSkill}
      />

      <EditSkillModal
        isOpen={Boolean(editingSkill)}
        onClose={() => setEditingSkill(null)}
        skill={editingSkill}
        onSaveSkill={handleEditSkill}
      />

      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onAddProject={handleAddProject}
      />

      <AssessmentModal
        isOpen={isAssessmentModalOpen}
        onClose={() => setIsAssessmentModalOpen(false)}
        roleName={profile.careerGoal}
        showToast={showToast}
        onAssessmentCompleted={() => {
          fetchSkills();
          fetchProjects();
        }}
      />

      {/* AI Career Mentor Floating Trigger & Slide-out Drawer */}
      <AIChatDrawer
        isOpen={isAiDrawerOpen}
        onToggle={() => setIsAiDrawerOpen(prev => !prev)}
        showToast={showToast}
        currentUser={currentUser}
      />

      {/* Toast Notification Stack */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
