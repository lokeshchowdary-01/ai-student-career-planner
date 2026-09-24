import React, { useState, useEffect } from 'react';
import { getAssessmentQuestions, submitAssessment, getAssessmentHistory } from '../apiConfig';

export default function AssessmentModal({ isOpen, onClose, roleId, roleName, showToast, onAssessmentCompleted }) {
  const [activeTab, setActiveTab] = useState('quiz'); // 'quiz' | 'results' | 'history'
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [confidenceRating, setConfidenceRating] = useState('Medium');

  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadQuestions();
      loadHistory();
      setActiveTab('quiz');
      setResult(null);
      setCurrentQIndex(0);
      setUserAnswers({});
    }
  }, [isOpen, roleId]);

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAssessmentQuestions(roleId);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
      setError('Unable to load assessment questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await getAssessmentHistory(roleId);
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectAnswer = (qId, answer) => {
    setUserAnswers(prev => ({
      ...prev,
      [qId]: answer
    }));
  };

  const handleSubmit = async () => {
    if (Object.keys(userAnswers).length === 0) {
      showToast('Please answer at least one question before submitting.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const payloadAnswers = Object.entries(userAnswers).map(([qId, ans]) => ({
        question_id: parseInt(qId, 10),
        selected_answer: ans,
        confidence: confidenceRating
      }));

      const res = await submitAssessment(roleId || 1, payloadAnswers, confidenceRating);
      setResult(res);
      setActiveTab('results');
      showToast(`Assessment completed! Score: ${res.score_percentage}% (${res.estimated_level})`, 'success');
      loadHistory();
      if (onAssessmentCompleted) onAssessmentCompleted(res);
    } catch (err) {
      console.error('Submission error:', err);
      showToast(err.message || 'Failed to submit assessment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = () => {
    setUserAnswers({});
    setCurrentQIndex(0);
    setResult(null);
    setActiveTab('quiz');
  };

  if (!isOpen) return null;

  const currentQ = questions[currentQIndex];
  const isLastQuestion = currentQIndex === questions.length - 1;
  const answeredCount = Object.keys(userAnswers).length;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window assessment-modal" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header">
          <div>
            <span className="modal-category-tag">Skill Verification</span>
            <h2 className="modal-title">Career Skill Assessment: {roleName || 'Target Role'}</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>

        {/* Tab navigation */}
        <div className="assessment-tabs">
          <button
            className={`assessment-tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('quiz')}
          >
            Assessment Quiz ({answeredCount}/{questions.length})
          </button>
          {result && (
            <button
              className={`assessment-tab-btn ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
            >
              Latest Results ({result.score_percentage}%)
            </button>
          )}
          <button
            className={`assessment-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); loadHistory(); }}
          >
            Attempt History ({history.length})
          </button>
        </div>

        {/* Content body */}
        <div className="modal-body assessment-modal-body">
          {error && (
            <div className="alert-notice alert-danger">
              <p>{error}</p>
              <button className="btn btn-sm btn-secondary" onClick={loadQuestions}>Retry</button>
            </div>
          )}

          {loading ? (
            <div className="empty-state-notice">
              <span className="spinner"></span>
              <p>Loading curated assessment questions from database...</p>
            </div>
          ) : activeTab === 'quiz' ? (
            questions.length === 0 ? (
              <div className="empty-state-notice">
                <p>Not enough data yet. No assessment questions registered for this career role.</p>
              </div>
            ) : currentQ ? (
              <div className="quiz-question-container">
                
                {/* Question metadata */}
                <div className="quiz-progress-bar-wrap">
                  <div
                    className="quiz-progress-bar"
                    style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }}
                  ></div>
                </div>

                <div className="quiz-q-meta">
                  <span className="quiz-q-number">Question {currentQIndex + 1} of {questions.length}</span>
                  <div className="quiz-tags">
                    <span className="quiz-skill-tag">{currentQ.skill_name}</span>
                    <span className="quiz-type-tag">{currentQ.question_type.replace('_', ' ')}</span>
                    <span className={`quiz-diff-tag diff-${currentQ.difficulty.toLowerCase()}`}>{currentQ.difficulty}</span>
                  </div>
                </div>

                {/* Question text */}
                <h3 className="quiz-q-text">{currentQ.question_text}</h3>

                {/* Code snippet if present */}
                {currentQ.code_snippet && (
                  <div className="quiz-code-box">
                    <pre><code>{currentQ.code_snippet}</code></pre>
                  </div>
                )}

                {/* Options list */}
                <div className="quiz-options-list">
                  {(currentQ.options || []).map((opt, oIdx) => {
                    const isSelected = userAnswers[currentQ.id] === opt;
                    return (
                      <button
                        key={oIdx}
                        className={`quiz-option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectAnswer(currentQ.id, opt)}
                      >
                        <span className="option-letter">{String.fromCharCode(65 + oIdx)}.</span>
                        <span className="option-text">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Confidence selector */}
                <div className="quiz-confidence-row">
                  <span className="conf-label">Confidence in your response:</span>
                  <div className="confidence-buttons">
                    {['Low', 'Medium', 'High'].map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        className={`conf-pill ${confidenceRating === lvl ? 'active' : ''}`}
                        onClick={() => setConfidenceRating(lvl)}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom step buttons */}
                <div className="quiz-nav-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentQIndex === 0}
                    onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                  >
                    &larr; Previous
                  </button>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!isLastQuestion ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1))}
                      >
                        Next &rarr;
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={submitting || answeredCount === 0}
                        onClick={handleSubmit}
                      >
                        {submitting ? 'Evaluating...' : `Submit Assessment (${answeredCount}/${questions.length})`}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            ) : null
          ) : activeTab === 'results' && result ? (
            /* Results Tab */
            <div className="assessment-results-view">
              <div className="results-hero-card">
                <div className="results-score-circle">
                  <span className="score-big">{result.score_percentage}%</span>
                  <span className="score-sub">{result.correct_count} of {result.total_questions} Correct</span>
                </div>
                <div className="results-hero-text">
                  <h3>Estimated Proficiency: <strong className="color-accent">{result.estimated_level}</strong></h3>
                  <p>Confidence Level: <strong>{result.confidence_rating}</strong></p>
                  <p className="results-summary-text">
                    This practical assessment evaluated code output, debugging, and core architectural principles.
                    Your results have been securely recorded into your evidence history.
                  </p>
                </div>
              </div>

              {/* Skill-by-skill breakdown */}
              <div className="results-breakdown-section">
                <h4>Skill Performance Breakdown</h4>
                <div className="breakdown-grid">
                  {Object.entries(result.skill_breakdown || {}).map(([skill, stat]) => (
                    <div key={skill} className="breakdown-card">
                      <div className="breakdown-header">
                        <span className="breakdown-skill">{skill}</span>
                        <strong className="breakdown-pct">{stat.score_percentage}%</strong>
                      </div>
                      <div className="breakdown-progress-bar">
                        <div
                          className="breakdown-fill"
                          style={{ width: `${stat.score_percentage}%` }}
                        ></div>
                      </div>
                      <span className="breakdown-counts">{stat.correct} / {stat.total} Questions Correct</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Question review */}
              <div className="results-answers-review">
                <h4>Detailed Question Review</h4>
                <div className="review-list">
                  {(result.evaluated_answers || []).map((ans, idx) => (
                    <div key={idx} className={`review-card ${ans.is_correct ? 'correct' : 'incorrect'}`}>
                      <div className="review-top">
                        <span className={`review-status-tag ${ans.is_correct ? 'tag-correct' : 'tag-incorrect'}`}>
                          {ans.is_correct ? '✓ Correct' : '✗ Incorrect'}
                        </span>
                        <span className="review-q-idx">Question {idx + 1}</span>
                      </div>
                      <p className="review-your-ans">
                        Your answer: <strong>{ans.selected_answer || '(No answer)'}</strong>
                      </p>
                      {!ans.is_correct && (
                        <p className="review-correct-ans">
                          Correct answer: <strong>{ans.correct_answer}</strong>
                        </p>
                      )}
                      {ans.explanation && (
                        <p className="review-explanation">{ans.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="results-actions-bar">
                <button className="btn btn-outline" onClick={handleRetake}>
                  Retake Assessment
                </button>
                <button className="btn btn-primary" onClick={onClose}>
                  Done & View Skill Evidence
                </button>
              </div>

            </div>
          ) : (
            /* Attempt History Tab */
            <div className="assessment-history-view">
              <h4>Historical Assessment Attempts</h4>
              {loadingHistory ? (
                <div className="empty-state-notice">
                  <span className="spinner"></span>
                  <p>Loading past attempts...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="empty-state-notice">
                  <p><strong>Not enough data yet</strong></p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    You have not completed an assessment for this career role yet. Take your first assessment above to establish your verified skill baseline!
                  </p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setActiveTab('quiz')}>
                    Start Assessment Now
                  </button>
                </div>
              ) : (
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Role Target</th>
                        <th>Score</th>
                        <th>Estimated Level</th>
                        <th>Confidence</th>
                        <th>Correct / Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(item => (
                        <tr key={item.id}>
                          <td>{item.attempt_date || 'Recent'}</td>
                          <td><strong>{item.role_name || roleName || 'Engineering Role'}</strong></td>
                          <td><span className="badge badge-accent">{item.score_percentage}%</span></td>
                          <td><span className={`level-pill level-${item.estimated_level.toLowerCase()}`}>{item.estimated_level}</span></td>
                          <td>{item.confidence_rating}</td>
                          <td>{item.correct_count} / {item.total_questions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                    <button className="btn btn-outline btn-sm" onClick={handleRetake}>
                      Take Another Attempt
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
