import { useState } from 'react';
import { ArrowLeft, FolderPlus, Sparkles, Database, Plus } from 'lucide-react';
import type { User } from 'firebase/auth';
import { ManualCreationTab } from './add-deck/ManualCreationTab';
import { ImportTab } from './add-deck/ImportTab';
import { AiGeneratorTab } from './add-deck/AiGeneratorTab';

interface AddDeckScreenProps {
  user: User;
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function AddDeckScreen({ user, onBack, showToast }: AddDeckScreenProps) {
  // Tabs: manual, import, ai
  const [addDeckMode, setAddDeckMode] = useState<'manual' | 'import' | 'ai'>('manual');

  // Shared progress / loading states for overlay
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  return (
    <div className="container">
      {/* Navigation */}
      <div className="navigation-bar">
        <button className="back-link" onClick={onBack} disabled={isImporting}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Header */}
      <header className="app-header" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FolderPlus size={28} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Add New Deck</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '4px', margin: '4px 0 0 0' }}>
          Create a new deck manually, import from files, or generate with AI.
        </p>
      </header>

      {/* Tabs */}
      <div className="tab-group" style={{ marginBottom: '24px' }}>
        <button 
          className={`tab-btn ${addDeckMode === 'manual' ? 'active' : ''}`}
          onClick={() => setAddDeckMode('manual')}
          disabled={isImporting}
        >
          <Plus size={16} />
          <span>Manual Creation</span>
        </button>
        <button 
          className={`tab-btn ${addDeckMode === 'import' ? 'active' : ''}`}
          onClick={() => setAddDeckMode('import')}
          disabled={isImporting}
        >
          <Database size={16} />
          <span>JSON/CSV Import</span>
        </button>
        <button 
          className={`tab-btn ${addDeckMode === 'ai' ? 'active' : ''}`}
          onClick={() => setAddDeckMode('ai')}
          disabled={isImporting}
        >
          <Sparkles size={16} />
          <span>AI Generator</span>
        </button>
      </div>

      {/* Main glass card container */}
      <div className="glass" style={{ padding: '24px', marginBottom: '32px' }}>
        {addDeckMode === 'manual' && (
          <ManualCreationTab 
            user={user} 
            onBack={onBack} 
            showToast={showToast} 
          />
        )}

        {addDeckMode === 'import' && (
          <ImportTab 
            user={user} 
            onBack={onBack} 
            showToast={showToast}
            isImporting={isImporting}
            setIsImporting={setIsImporting}
            setImportProgress={setImportProgress}
          />
        )}

        {addDeckMode === 'ai' && (
          <AiGeneratorTab 
            user={user} 
            onBack={onBack} 
            showToast={showToast}
            isImporting={isImporting}
            setIsImporting={setIsImporting}
            setImportProgress={setImportProgress}
          />
        )}
      </div>

      {/* Progress overlays */}
      {isImporting && (
        <div className="progress-overlay">
          <div className="progress-card glass animate-fade-in">
            <div className="progress-spinner-container">
              <div className="progress-spinner"></div>
              <Database className="progress-icon" size={28} />
            </div>
            <div className="progress-info">
              <h3 className="progress-title">Importing Deck...</h3>
              <p className="progress-subtitle">
                Saving cards to Firestore. Please do not close the application.
              </p>
            </div>
            {importProgress && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span className="progress-percentage">
                  {Math.round((importProgress.current / importProgress.total) * 100)}%
                </span>
                <div className="progress-bar-wrapper">
                  <div 
                    className="progress-bar-fill-animated"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  ></div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {importProgress.current} / {importProgress.total} cards
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
