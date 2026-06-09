import { useState } from 'react';
import { ArrowLeft, Settings, Eye, EyeOff, SlidersHorizontal, Info } from 'lucide-react';

interface SettingsScreenProps {
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function SettingsScreen({ onBack, showToast }: SettingsScreenProps) {
  // Question Font Size
  const [questionFontSize, setQuestionFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_question_font_size');
    return val ? parseInt(val, 10) : 28;
  });

  // Answer Font Size
  const [answerFontSize, setAnswerFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_answer_font_size');
    return val ? parseInt(val, 10) : 28;
  });

  // Show SRS Details
  const [showStudyDetails, setShowStudyDetails] = useState<boolean>(() => {
    return localStorage.getItem('memocard_show_study_details') === 'true';
  });

  // Google AI API Key
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('google_ai_api_key') || '');
  const [showKeyText, setShowKeyText] = useState(false);

  // Card Preview Side
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  const handleSave = () => {
    localStorage.setItem('memocard_question_font_size', String(questionFontSize));
    localStorage.setItem('memocard_answer_font_size', String(answerFontSize));
    localStorage.setItem('memocard_show_study_details', String(showStudyDetails));
    localStorage.setItem('google_ai_api_key', googleApiKey.trim());
    showToast('Settings saved successfully!', 'success');
    onBack();
  };

  return (
    <div className="container">
      {/* Navigation */}
      <div className="navigation-bar">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Header */}
      <header className="app-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={28} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Study Settings</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '4px', margin: '4px 0 0 0' }}>
          Configure card styles, SRS parameters, and AI generation key.
        </p>
      </header>

      {/* Main glass card container */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start', marginBottom: '32px' }}>
        
        {/* Settings Form Column */}
        <div className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SlidersHorizontal size={18} style={{ color: 'var(--primary)' }} />
            Preferences
          </h3>

          {/* Question Font Size Slider */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Question Font Size</label>
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{questionFontSize}px</span>
            </div>
            <input 
              type="range" 
              min="16" 
              max="48" 
              value={questionFontSize} 
              onChange={(e) => setQuestionFontSize(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Answer Font Size Slider */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Answer Font Size</label>
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{answerFontSize}px</span>
            </div>
            <input 
              type="range" 
              min="16" 
              max="48" 
              value={answerFontSize} 
              onChange={(e) => setAnswerFontSize(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Show Study Details Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '16px 0', 
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ paddingRight: '16px' }}>
              <label className="form-label" style={{ marginBottom: '2px', cursor: 'pointer', display: 'block' }}>Show SRS details on buttons</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, margin: 0, lineHeight: '1.3' }}>
                Displays time to next review and change in ease factor (SM-2).
              </p>
            </div>
            <input 
              type="checkbox" 
              checked={showStudyDetails} 
              onChange={(e) => setShowStudyDetails(e.target.checked)}
              style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
            />
          </div>

          {/* Google AI API Key Input */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Google AI API Key</label>
              <a 
                href="https://aistudio.google.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'underline' }}
              >
                Get free key
              </a>
            </div>
            <div style={{ position: 'relative' }}>
              <input 
                type={showKeyText ? "text" : "password"} 
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="form-control"
                style={{ width: '100%', paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowKeyText(!showKeyText)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showKeyText ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7, marginTop: '6px', marginBottom: 0 }}>
              Used for generating card decks via Gemini models inside the Add Deck subpage.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flex: 1 }}
              onClick={onBack}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ flex: 2 }}
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        </div>

        {/* Live Preview Column */}
        <div className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={18} style={{ color: 'var(--primary)' }} />
            Card Preview
          </h3>

          {/* Tabs to select Front / Back preview */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '10px',
            padding: '3px',
          }}>
            <button 
              type="button"
              onClick={() => setPreviewSide('front')}
              style={{
                flex: 1,
                padding: '8px',
                background: previewSide === 'front' ? 'var(--primary)' : 'transparent',
                color: previewSide === 'front' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Question (Front)
            </button>
            <button 
              type="button"
              onClick={() => setPreviewSide('back')}
              style={{
                flex: 1,
                padding: '8px',
                background: previewSide === 'back' ? 'var(--primary)' : 'transparent',
                color: previewSide === 'back' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Answer (Back)
            </button>
          </div>

          {/* Card Container Preview */}
          <div 
            className={`flashcard-container ${previewSide === 'back' ? 'is-flipped' : ''}`}
            style={{ 
              height: 'auto', 
              minHeight: '220px', 
              marginBottom: 0, 
              pointerEvents: 'none'
            }}
          >
            <div className="flashcard-inner" style={{ height: 'auto', minHeight: 'inherit' }}>
              {previewSide === 'front' ? (
                /* Front preview */
                <div className="flashcard-face flashcard-front" style={{ minHeight: '220px', height: 'auto', padding: '24px' }}>
                  <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>
                    What is the capital of France?
                  </span>
                </div>
              ) : (
                /* Back preview */
                <div className="flashcard-face flashcard-back" style={{ minHeight: '220px', height: 'auto', padding: '24px', paddingTop: '50px' }}>
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    right: '12px',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    opacity: 0.7,
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingBottom: '4px',
                    fontStyle: 'italic'
                  }}>
                    What is the capital of France?
                  </div>
                  <span className="flashcard-text" style={{ fontSize: `${answerFontSize}px` }}>
                    Paris (Paris) - it is the largest city and the capital of France, located on the Seine river.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
