import React, { useState, useEffect } from 'react';

/**
 * Reusable and Beginner-Friendly Modal Dialogs
 */

// 1. Edit Profile & Career Goal Modal
export function EditProfileModal({ isOpen, onClose, profile, onSave }) {
  const [formData, setFormData] = useState({ ...profile });

  useEffect(() => {
    if (profile) setFormData({ ...profile });
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Student Profile & Goal</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="input-student-name">Student Full Name *</label>
            <input
              type="text"
              id="input-student-name"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-student-badge">Academic Badge / Title</label>
            <input
              type="text"
              id="input-student-badge"
              value={formData.badge || ''}
              onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-student-bio">Student Bio / Summary</label>
            <textarea
              id="input-student-bio"
              rows="3"
              value={formData.bio || ''}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            ></textarea>
          </div>
          <div className="form-divider"></div>
          <div className="form-group">
            <label htmlFor="input-career-goal">Current Career Goal *</label>
            <input
              type="text"
              id="input-career-goal"
              required
              value={formData.careerGoal || ''}
              onChange={(e) => setFormData({ ...formData, careerGoal: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-target-date">Target Timeline</label>
            <input
              type="text"
              id="input-target-date"
              value={formData.targetDate || ''}
              onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 2. Add New Skill Modal
export function AddSkillModal({ isOpen, onClose, onAddSkill }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Frontend');
  const [level, setLevel] = useState('Intermediate');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddSkill({ name: name.trim(), category, level });
    setName('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Skill</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="input-skill-name">Skill Name *</label>
            <input
              type="text"
              id="input-skill-name"
              required
              placeholder="e.g. TypeScript, PyTorch, Docker"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-skill-category">Category *</label>
            <select
              id="input-skill-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Frontend">Frontend</option>
              <option value="Backend">Backend</option>
              <option value="AI & Data">AI & Data</option>
              <option value="DevOps & Cloud">DevOps & Cloud</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="input-skill-level">Proficiency Level</label>
            <select
              id="input-skill-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="Advanced">Advanced (80-100%)</option>
              <option value="Intermediate">Intermediate (50-79%)</option>
              <option value="Beginner">Beginner (1-49%)</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Skill</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 2b. Edit Skill Modal
export function EditSkillModal({ isOpen, onClose, skill, onSaveSkill }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Frontend');
  const [level, setLevel] = useState('Intermediate');

  useEffect(() => {
    if (skill) {
      setName(skill.name || '');
      setCategory(skill.category || 'Frontend');
      setLevel(skill.level || 'Intermediate');
    }
  }, [skill, isOpen]);

  if (!isOpen || !skill) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSaveSkill(skill.id, { name: name.trim(), category, level });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Skill</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="edit-skill-name">Skill Name *</label>
            <input
              type="text"
              id="edit-skill-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="edit-skill-category">Category *</label>
            <select
              id="edit-skill-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Frontend">Frontend</option>
              <option value="Backend">Backend</option>
              <option value="AI & Data">AI & Data</option>
              <option value="DevOps & Cloud">DevOps & Cloud</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="edit-skill-level">Proficiency Level</label>
            <select
              id="edit-skill-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="Advanced">Advanced (80-100%)</option>
              <option value="Intermediate">Intermediate (50-79%)</option>
              <option value="Beginner">Beginner (1-49%)</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 3. Add New Project Modal
export function AddProjectModal({ isOpen, onClose, onAddProject }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('In Progress');
  const [link, setLink] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : ['General'];
    onAddProject({
      title: title.trim(),
      desc: desc.trim(),
      tags: tagList,
      status,
      link: link.trim()
    });
    setTitle('');
    setDesc('');
    setTags('');
    setLink('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Project</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="input-project-title">Project Title *</label>
            <input
              type="text"
              id="input-project-title"
              required
              placeholder="e.g. Distributed KV-Store"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-project-desc">Description *</label>
            <textarea
              id="input-project-desc"
              rows="2"
              required
              placeholder="What did you build and which problem does it solve?"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            ></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="input-project-tags">Tech Stack (comma separated)</label>
            <input
              type="text"
              id="input-project-tags"
              placeholder="e.g. React, Python, PostgreSQL, Docker"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="input-project-status">Project Status</label>
            <select
              id="input-project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Under Review">Under Review</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="input-project-link">Repo or Demo URL</label>
            <input
              type="text"
              id="input-project-link"
              placeholder="https://github.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Project</button>
          </div>
        </form>
      </div>
    </div>
  );
}
