import { useState, useEffect } from 'react';
import { Plus, FolderPlus, LogOut, BookOpen, Settings, X, Layers, RefreshCw, User as UserIcon } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import type { Deck, Card } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';
import { parseImportData, extractMetadata } from '../utils/importParser';

declare const __APP_VERSION__: string;

interface DashboardScreenProps {
  user: User;
  onLogout: () => void;
  onSelectDeck: (deck: Deck) => void;
  onStartReview: (deck: Deck) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function DashboardScreen({
  user,
  onLogout,
  onSelectDeck,
  onStartReview,
  showToast
}: DashboardScreenProps) {
  const { decks, loadingDecks, addDeck, importDeck, cloneSharedDeck, getCardsOnce } = useFirestore(user.uid);
  
  const [deckStats, setDeckStats] = useState<Record<string, { total: number; due: number; mastered: number; ease: string }>>({});
  const [expandedDecks, setExpandedDecks] = useState<Record<string, boolean>>({});

  const toggleDeckExpand = (deckId: string) => {
    setExpandedDecks(prev => ({
      ...prev,
      [deckId]: !prev[deckId]
    }));
  };

  useEffect(() => {
    if (loadingDecks || decks.length === 0) return;

    decks.forEach((deck) => {
      if (deck.isShared) {
        setDeckStats(prev => ({
          ...prev,
          [deck.id]: {
            total: deck.cardCount || 0,
            due: 0,
            mastered: 0,
            ease: '2.50'
          }
        }));
        return;
      }

      // Fetch cards with cache-first and background server check
      getCardsOnce(deck.id, (loadedCards: Card[]) => {
        const total = loadedCards.length;
        let due = 0;
        let mastered = 0;
        let totalEase = 0;
        let easeCount = 0;
        const now = new Date();

        loadedCards.forEach(card => {
          if (card.nextReview) {
            const reviewDate = typeof card.nextReview.toDate === 'function' 
              ? card.nextReview.toDate() 
              : new Date((card.nextReview as any).seconds * 1000);
            if (reviewDate <= now) {
              due++;
            }
          } else {
            due++;
          }

          if (card.repetitions > 0 && card.interval >= 7) {
            mastered++;
          }

          if (card.easeFactor) {
            totalEase += card.easeFactor;
            easeCount++;
          }
        });

        const ease = easeCount > 0 ? (totalEase / easeCount).toFixed(2) : '2.50';

        setDeckStats(prev => ({
          ...prev,
          [deck.id]: { total, due, mastered, ease }
        }));
      });
    });
  }, [decks, loadingDecks]);

  useEffect(() => {
    if ((window as any).WowkDigitalFooter) {
      (window as any).WowkDigitalFooter.init({
        siteName: 'MemoCard',
        container: '#wowk-footer-container',
        brandName: 'Wowk Digital',
        brandUrl: 'https://github.com/WowkDigital',
        showHubLink: true,
        hubUrl: 'https://wowkdigital.github.io/WD_HUB/'
      });
    }
  }, []);

  const forceUpdateApp = async () => {
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error('Error unregistering service worker:', e);
      }
    }
    // Clear caches
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      } catch (e) {
        console.error('Error clearing cache:', e);
      }
    }
    // Force reload from server bypassing cache
    window.location.reload();
  };

  const getDeckCreationDateStr = (deck: Deck): string => {
    if (!deck.createdAt) return 'Unknown';
    let date: Date;
    if (typeof deck.createdAt.toDate === 'function') {
      date = deck.createdAt.toDate();
    } else {
      const ca = deck.createdAt as any;
      if (ca instanceof Date) {
        date = ca;
      } else if (ca.seconds !== undefined) {
        date = new Date(ca.seconds * 1000);
      } else {
        date = new Date(ca);
      }
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // JSON import states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSelectDeckClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      showToast('Cloning shared deck...', 'success');
      try {
        await cloneSharedDeck(deck.ownerId, deck.id);
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        onSelectDeck(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck.', 'error');
      }
    } else {
      onSelectDeck(deck);
    }
  };

  const handleStartReviewClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      showToast('Preparing shared deck...', 'success');
      try {
        await cloneSharedDeck(deck.ownerId, deck.id);
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        onStartReview(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck for studying.', 'error');
      }
    } else {
      onStartReview(deck);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    
    setIsSubmitting(true);
    try {
      await addDeck(newDeckName.trim(), newDeckDesc.trim());
      showToast('New deck created!', 'success');
      setNewDeckName('');
      setNewDeckDesc('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to create deck.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    
    const text = importJSON.trim();
    if (!text) {
      setImportError('Please paste data to import.');
      return;
    }

    setIsImporting(true);
    try {
      // Universal parsing
      const parsed = parseImportData(text);
      
      const finalName = importName.trim() || parsed.name || '';
      const finalDesc = importDesc.trim() || parsed.description || '';

      if (!finalName) {
        throw new Error('Please provide a deck name (either fill the name field or include it at the beginning of the pasted data).');
      }

      await importDeck(finalName, finalDesc, parsed.cards);
      showToast('New deck with flashcards imported!', 'success');
      setImportJSON('');
      setImportName('');
      setImportDesc('');
      setShowImportModal(false);
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Invalid data format.');
      showToast('Failed to import deck.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={24} style={{ color: 'var(--primary)' }} />
          <span>MemoCard</span>
          <button 
            className="app-version" 
            onClick={forceUpdateApp}
            title="Force reload & check for update"
            style={{ 
              fontSize: '0.7rem', 
              color: 'var(--text-primary)', 
              background: 'rgba(99, 102, 241, 0.15)', 
              padding: '2px 6px', 
              borderRadius: '4px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
            }}
          >
            v{__APP_VERSION__}
            <RefreshCw size={10} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div 
            className="user-avatar" 
            title={user.isAnonymous ? 'Guest Account' : user.email || ''}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              background: user.isAnonymous ? 'rgba(255, 255, 255, 0.05)' : 'rgba(99, 102, 241, 0.15)',
              border: `1px solid ${user.isAnonymous ? 'var(--border-light)' : 'rgba(99, 102, 241, 0.3)'}`,
              color: user.isAnonymous ? 'var(--text-secondary)' : 'var(--primary)',
              cursor: 'pointer'
            }}
          >
            <UserIcon size={16} />
          </div>
          <button className="logout-btn" onClick={onLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        <div className="section-title">
          <h2>Your Decks</h2>
          <div className="section-actions" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem' }}
              onClick={() => setShowImportModal(true)}
            >
              Import from JSON
            </button>
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem' }}
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              New Deck
            </button>
          </div>
        </div>

        {loadingDecks ? (
          <div className="loading-spinner"></div>
        ) : decks.length === 0 ? (
          <div className="empty-state glass">
            <FolderPlus size={48} className="empty-icon" />
            <p className="empty-text">You do not have any flashcard decks yet.</p>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowAddModal(true)}>
              Create your first deck
            </button>
          </div>
        ) : (
          <div className="deck-list">
            {decks.map((deck) => {
              const isExpanded = !!expandedDecks[deck.id];
              return (
                <div 
                  key={deck.id} 
                  className="deck-card glass" 
                  onClick={() => toggleDeckExpand(deck.id)}
                  style={{ 
                    padding: '12px 16px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '10px',
                    alignItems: 'stretch',
                    cursor: 'pointer'
                  }}
                >
                  <div className="deck-info" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left', minWidth: 0 }}>
                    {/* Row 1: Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, width: '100%' }}>
                      <span className="deck-name" style={{ 
                        fontSize: '1.05rem',
                        lineHeight: '1.2',
                        fontWeight: 600,
                        flex: 1,
                        minWidth: 0,
                        ...(isExpanded ? {
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        } : {
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        })
                      }}>{deck.name}</span>
                      {deck.isShared && (
                        <span className="card-badge" style={{ 
                          background: 'rgba(99, 102, 241, 0.1)', 
                          color: '#a5b4fc', 
                          fontSize: '0.7rem', 
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          Shared
                        </span>
                      )}
                    </div>
                    
                    {/* Row 2: Description */}
                    {deck.description && (
                      <span className="deck-desc" style={{ 
                        fontSize: '0.8rem',
                        lineHeight: '1.3',
                        color: 'var(--text-secondary)',
                        width: '100%',
                        ...(isExpanded ? {
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        } : {
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        })
                      }}>{deck.description}</span>
                    )}
                  </div>
                  
                  {/* Bottom Row: Stats and Action Buttons */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: '12px',
                    width: '100%'
                  }}>
                    {/* Row 3: Parameters "30/1/0/2.47" */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      flexWrap: 'wrap',
                      gap: '4px', 
                      fontSize: '0.8rem', 
                      color: 'var(--text-muted)',
                      lineHeight: '1',
                      minWidth: 0
                    }}>
                      <strong style={{ color: 'var(--primary)' }}>{deckStats[deck.id]?.total ?? deck.cardCount}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: (deckStats[deck.id]?.due ?? 0) > 0 ? 'var(--color-again)' : 'var(--text-muted)' }}>{deckStats[deck.id]?.due ?? 0}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: 'var(--color-easy)' }}>{deckStats[deck.id]?.mastered ?? 0}</strong>
                      <span style={{ opacity: 0.3 }}>/</span>
                      <strong style={{ color: '#c084fc' }}>{deckStats[deck.id]?.ease ?? '2.50'}</strong>
                      {deck.createdAt && (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minWidth: 0
                        }}>
                          <span style={{ opacity: 0.3, marginLeft: '4px', marginRight: '4px' }}>•</span>
                          Created: {getDeckCreationDateStr(deck)}
                        </span>
                      )}
                    </div>
                    
                    {/* Action buttons (only icons, no text labels) */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectDeckClick(deck);
                        }}
                        title="Manage cards"
                      >
                        <Settings size={14} />
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartReviewClick(deck);
                        }}
                        disabled={(deckStats[deck.id]?.total ?? deck.cardCount) === 0}
                        title={(deckStats[deck.id]?.total ?? deck.cardCount) === 0 ? "No cards to study" : "Start studying"}
                      >
                        <BookOpen size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer Container */}
      <div id="wowk-footer-container" style={{ width: '100%', marginTop: 'auto' }}></div>

      {/* Add Deck Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass animate-fade-in">
            <div className="modal-header">
              <h3 className="modal-title">New Flashcard Deck</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Deck name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. English Vocabulary C1" 
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  required
                  maxLength={50}
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Phrases from chapter 4" 
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: 'auto' }}
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: 'auto' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Deck Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content glass animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Import Deck</h3>
              <button className="close-btn" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleImportSubmit}>
              <div className="form-row-grid">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deck name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Provide if not in data" 
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    maxLength={50}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deck description</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Provide if not in data" 
                    value={importDesc}
                    onChange={(e) => setImportDesc(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Paste data (JSON, CSV, Excel)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                  placeholder="Paste JSON array, CSV data (separated by ;) or copied columns from Excel..."
                  value={importJSON}
                  onChange={(e) => {
                    const val = e.target.value;
                    setImportJSON(val);
                    const meta = extractMetadata(val);
                    if (meta.name) setImportName(meta.name);
                    if (meta.description) setImportDesc(meta.description);
                  }}
                  required
                />
              </div>

              {importError && (
                <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚠️ {importError}</span>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <span className="form-label" style={{ marginBottom: '4px' }}>Allowed data formats (optional metadata at the beginning):</span>
                <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`// 1. Plain text / CSV with optional Metadata (Recommended)
# name: Spanish Vocabulary
# description: Common words and phrases
Hola;Hello
Gracias;Thank you

// 2. Compact JSON with optional Metadata
{
  "name": "Spanish Vocabulary",
  "description": "Common words and phrases",
  "cards": [
    ["Hola", "Hello"],
    ["Gracias", "Thank you"]
  ]
}

// 3. Simple Card List (no metadata)
Hola;Hello
Gracias;Thank you`}
                </pre>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: 'auto' }}
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: 'auto' }}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
