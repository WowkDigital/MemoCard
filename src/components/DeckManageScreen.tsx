import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  Plus, 
  AlertCircle, 
  Layers, 
  BarChart2, 
  BookOpen, 
  Award, 
  Clock, 
  TrendingUp,
  Database
} from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import type { Deck, Card } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';
import { parseImportData } from '../utils/importParser';

interface DeckManageScreenProps {
  user: User;
  deck: Deck;
  onBack: () => void;
  onDeleteDeckSuccess: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function DeckManageScreen({
  user,
  deck,
  onBack,
  onDeleteDeckSuccess,
  showToast
}: DeckManageScreenProps) {
  const { addCard, deleteCard, importCards, deleteDeck, subscribeToCards, updateDeck } = useFirestore(user.uid);
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);

  // States for displaying and editing deck settings
  const [displayName, setDisplayName] = useState(deck.name);
  const [displayDesc, setDisplayDesc] = useState(deck.description || '');
  const [editName, setEditName] = useState(deck.name);
  const [editDesc, setEditDesc] = useState(deck.description || '');
  const [visibility, setVisibility] = useState<'private' | 'public' | 'guest'>(deck.visibility || 'private');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSavingSettings(true);
    try {
      await updateDeck(deck.id, editName.trim(), editDesc.trim(), visibility);
      setDisplayName(editName.trim());
      setDisplayDesc(editDesc.trim());
      showToast('Deck settings updated successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update deck settings.', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };
  
  const [activeTab, setActiveTab] = useState<'cards' | 'stats'>('cards');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showConfirmDeleteDeck, setShowConfirmDeleteDeck] = useState(false);

  // JSON import states
  const [showImportMode, setShowImportMode] = useState(false);
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Subscribe to deck's cards
  useEffect(() => {
    const unsubscribe = subscribeToCards(deck.id, (loadedCards) => {
      setCards(loadedCards);
      setLoadingCards(false);
    });
    return unsubscribe;
  }, [deck.id, subscribeToCards]);

  // Initialize footer
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

  // Helper to safely parse Firebase/local Timestamps or Javascript Dates
  const getCardReviewDate = (card: Card): Date => {
    if (!card.nextReview) return new Date();
    if (typeof card.nextReview.toDate === 'function') {
      return card.nextReview.toDate();
    }
    const nr = card.nextReview as any;
    if (nr instanceof Date) return nr;
    if (nr.seconds !== undefined) return new Date(nr.seconds * 1000);
    return new Date(nr);
  };

  // Calculate statistics
  const totalCards = cards.length;
  let newCards = 0;
  let learningCards = 0;
  let reviewCards = 0;
  let totalEaseFactor = 0;
  let easeCount = 0;
  let dueNow = 0;
  
  let hardEase = 0; // < 2.2
  let midEase = 0;  // 2.2 to 2.8
  let easyEase = 0; // > 2.8

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dailySchedule = Array(7).fill(0);
  let futureDue = 0;

  cards.forEach(card => {
    // Learning stage
    if (card.repetitions === 0) {
      newCards++;
    } else if (card.interval < 7) {
      learningCards++;
    } else {
      reviewCards++;
    }

    // Ease factor
    if (card.easeFactor) {
      totalEaseFactor += card.easeFactor;
      easeCount++;
      if (card.easeFactor < 2.2) {
        hardEase++;
      } else if (card.easeFactor <= 2.8) {
        midEase++;
      } else {
        easyEase++;
      }
    }

    // Next review
    const reviewDate = getCardReviewDate(card);
    if (reviewDate <= now) {
      dueNow++;
    }

    // 7-day schedule
    const diffTime = reviewDate.getTime() - todayStart.getTime();
    const diffDays = Math.floor(diffTime / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) {
      dailySchedule[0]++;
    } else if (diffDays >= 1 && diffDays <= 6) {
      dailySchedule[diffDays]++;
    } else {
      futureDue++;
    }
  });

  const avgEaseFactor = easeCount > 0 ? (totalEaseFactor / easeCount).toFixed(2) : '2.50';
  const newPercent = totalCards > 0 ? (newCards / totalCards) * 100 : 0;
  const learningPercent = totalCards > 0 ? (learningCards / totalCards) * 100 : 0;
  const reviewPercent = totalCards > 0 ? (reviewCards / totalCards) * 100 : 0;

  const getDayLabel = (offset: number) => {
    if (offset === 0) return 'Today';
    const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await deleteCard(deck.id, cardId);
      showToast('Card deleted.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete card.', 'error');
    }
  };

  const handleDeleteDeckClick = async () => {
    try {
      await deleteDeck(deck.id);
      onDeleteDeckSuccess();
    } catch (err) {
      console.error(err);
      showToast('Failed to delete deck.', 'error');
    }
  };

  const handleAddCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    setIsAdding(true);
    try {
      await addCard(deck.id, front.trim(), back.trim());
      showToast('Card added!', 'success');
      setFront('');
      setBack('');
    } catch (err) {
      console.error(err);
      showToast('Failed to add card.', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    const text = importJSON.trim();
    if (!text) return;

    setIsImporting(true);
    try {
      const parsed = parseImportData(text);
      setImportProgress({ current: 0, total: parsed.cards.length });
      await importCards(deck.id, parsed.cards, (progress) => {
        setImportProgress({ current: progress, total: parsed.cards.length });
      });
      showToast(`${parsed.cards.length} cards imported!`, 'success');
      setImportJSON('');
      setShowImportMode(false);
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Invalid data format.');
      showToast('Import failed.', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
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

      {/* Deck Header */}
      <header className="app-header" style={{ marginBottom: '16px', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={22} style={{ color: 'var(--primary)' }} />
            {displayName}
          </h1>
          {displayDesc && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{displayDesc}</p>
          )}
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="tab-group">
        <button 
          className={`tab-btn ${activeTab === 'cards' ? 'active' : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          <BookOpen size={16} />
          <span>Cards & Settings</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <BarChart2 size={16} />
          <span>Statistics & Insights</span>
        </button>
      </div>

      {activeTab === 'cards' && (
        <>
          {/* Add Card Form */}
          <div className="glass" style={{ padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>
                {showImportMode ? 'Import flashcards from JSON' : 'Add new flashcard'}
              </h3>
              <button 
                className="btn btn-secondary" 
                style={{ width: 'auto', padding: '4px 12px', fontSize: '0.8rem' }}
                onClick={() => {
                  setShowImportMode(!showImportMode);
                  setImportError(null);
                }}
              >
                {showImportMode ? 'Manual Entry' : 'Import from JSON'}
              </button>
            </div>

            {!showImportMode ? (
              <form onSubmit={handleAddCardSubmit}>
                <div className="form-row-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Front</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Hello" 
                      value={front}
                      onChange={(e) => setFront(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Back</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Cześć" 
                      value={back}
                      onChange={(e) => setBack(e.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={isAdding}
                >
                  <Plus size={16} />
                  {isAdding ? 'Adding...' : 'Add Flashcard'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleImportSubmit}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Paste data (JSON, CSV, Excel)</label>
                  <textarea 
                    className="form-input" 
                    style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                    placeholder="Paste JSON array, CSV data (separated by ;) or copied columns from Excel..."
                    value={importJSON}
                    onChange={(e) => setImportJSON(e.target.value)}
                    required
                  />
                </div>

                {importError && (
                  <div style={{ color: 'var(--color-again)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ {importError}</span>
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <span className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Examples of efficient formats (metadata headers will be ignored since deck exists):</span>
                  <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`// 1. Plain text / Excel / CSV (Recommended — fastest)
Hello;Cześć
Goodbye;Do widzenia

// 2. Compact JSON (without repeating keys)
[
  ["Hello", "Cześć"],
  ["Goodbye", "Do widzenia"]
]`}
                  </pre>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importing...' : 'Start Import'}
                </button>
              </form>
            )}
          </div>

          {/* Cards List Section */}
          <div className="section-title">
            <h2>Deck Contents ({cards.length} {cards.length === 1 ? 'card' : 'cards'})</h2>
          </div>

          {loadingCards ? (
            <div className="loading-spinner"></div>
          ) : cards.length === 0 ? (
            <div className="empty-state glass">
              <AlertCircle size={40} className="empty-icon" />
              <p className="empty-text">The deck is empty. Add flashcards above to start.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
              {cards.map((card) => (
                <div key={card.id} className="card-item glass">
                  <div className="card-item-content">
                    <span className="card-item-front">{card.front}</span>
                    <span className="card-item-back">{card.back}</span>
                    <span className="card-item-meta">
                      {card.interval >= 999999 ? (
                        <span style={{ color: 'var(--color-forever)', fontWeight: 600 }}>Remembered Forever</span>
                      ) : (
                        `Repetitions: ${card.repetitions} | Ease: ${card.easeFactor} | Interval: ${card.interval}d`
                      )}
                    </span>
                  </div>
                  <button 
                    className="delete-icon-btn" 
                    onClick={() => handleDeleteCard(card.id)}
                    title="Delete flashcard"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Deck Settings */}
          <div className="glass" style={{ padding: '20px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontWeight: 600, fontSize: '1.1rem' }}>Deck Settings</h3>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Deck name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={50}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Description</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '8px' }}>Visibility</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="visibility" 
                      value="private" 
                      checked={visibility === 'private'}
                      onChange={() => setVisibility('private')}
                      style={{ marginTop: '3px', width: 'auto', display: 'inline-block' }}
                    />
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>Private</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Only you can view and study this deck.</span>
                    </div>
                  </label>
                  
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="visibility" 
                      value="public" 
                      checked={visibility === 'public'}
                      onChange={() => setVisibility('public')}
                      style={{ marginTop: '3px', width: 'auto', display: 'inline-block' }}
                    />
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>Public (Registered Users)</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Logged-in users can view, clone, and study this deck.</span>
                    </div>
                  </label>
                  
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="visibility" 
                      value="guest" 
                      checked={visibility === 'guest'}
                      onChange={() => setVisibility('guest')}
                      style={{ marginTop: '3px', width: 'auto', display: 'inline-block' }}
                    />
                    <div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>Available for Guests</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Anyone (including anonymous guest accounts) can view, clone, and study this deck.</span>
                    </div>
                  </label>
                </div>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '8px' }}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Danger Zone: Delete Deck */}
          <div className="glass" style={{ padding: '20px', border: '1px dashed rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.02)' }}>
            <h3 style={{ color: 'var(--color-again)', marginBottom: '12px', fontSize: '1.1rem' }}>Danger Zone</h3>
            {!showConfirmDeleteDeck ? (
              <button 
                className="btn btn-danger" 
                style={{ width: 'auto' }}
                onClick={() => setShowConfirmDeleteDeck(true)}
              >
                <Trash2 size={16} />
                Delete deck and all cards
              </button>
            ) : (
              <div>
                <p style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                  Are you sure you want to permanently delete this deck and all of its flashcards?
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ width: 'auto' }}
                    onClick={() => setShowConfirmDeleteDeck(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-danger" 
                    style={{ width: 'auto' }}
                    onClick={handleDeleteDeckClick}
                  >
                    Yes, delete deck
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'stats' && (
        <div className="stats-panel-content animate-fade-in">
          {totalCards === 0 ? (
            <div className="empty-state glass" style={{ margin: 0, padding: '40px 24px' }}>
              <BarChart2 size={40} className="empty-icon" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>No Statistics Available</h3>
              <p className="empty-text" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Add some cards to this deck first. Once cards are added and reviewed, study analytics and SRS intervals will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="stats-grid">
                <div className="stats-card glass">
                  <span className="stats-number">{totalCards}</span>
                  <span className="stats-label">Total Cards</span>
                  <BookOpen size={48} className="stats-card-icon" />
                </div>
                <div className="stats-card glass due">
                  <span className="stats-number" style={{ color: dueNow > 0 ? 'var(--color-hard)' : 'var(--text-primary)' }}>{dueNow}</span>
                  <span className="stats-label">Due Now</span>
                  <Clock size={48} className="stats-card-icon" />
                </div>
                <div className="stats-card glass memorized">
                  <span className="stats-number" style={{ color: reviewCards > 0 ? 'var(--color-easy)' : 'var(--text-primary)' }}>{reviewCards}</span>
                  <span className="stats-label">Mastered</span>
                  <Award size={48} className="stats-card-icon" />
                </div>
                <div className="stats-card glass ease">
                  <span className="stats-number">{avgEaseFactor}</span>
                  <span className="stats-label">Avg Ease</span>
                  <TrendingUp size={48} className="stats-card-icon" />
                </div>
              </div>

              {/* Learning Progress Breakdown */}
              <div className="glass" style={{ padding: '20px' }}>
                <h4 style={{ marginBottom: '4px', fontSize: '1.05rem', fontWeight: 600 }}>Learning Progress</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
                  Cards categorized by study repetitions and spacing intervals.
                </p>
                
                {/* Horizontal Segmented Progress Bar */}
                <div style={{
                  display: 'flex',
                  height: '16px',
                  borderRadius: '99px',
                  overflow: 'hidden',
                  background: 'rgba(255, 255, 255, 0.05)',
                  marginBottom: '16px'
                }}>
                  {newPercent > 0 && (
                    <div 
                      style={{ 
                        width: `${newPercent}%`, 
                        background: 'var(--primary)', 
                        transition: 'width 0.3s ease' 
                      }} 
                      title={`New: ${newCards} (${newPercent.toFixed(0)}%)`}
                    />
                  )}
                  {learningPercent > 0 && (
                    <div 
                      style={{ 
                        width: `${learningPercent}%`, 
                        background: 'var(--color-hard)', 
                        transition: 'width 0.3s ease' 
                      }} 
                      title={`Learning: ${learningCards} (${learningPercent.toFixed(0)}%)`}
                    />
                  )}
                  {reviewPercent > 0 && (
                    <div 
                      style={{ 
                        width: `${reviewPercent}%`, 
                        background: 'var(--color-easy)', 
                        transition: 'width 0.3s ease' 
                      }} 
                      title={`Mastered: ${reviewCards} (${reviewPercent.toFixed(0)}%)`}
                    />
                  )}
                </div>

                {/* Legend list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }}></span>
                      <span style={{ fontWeight: 500 }}>New Cards</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong>{newCards}</strong> cards ({newPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-hard)', display: 'inline-block' }}></span>
                      <span style={{ fontWeight: 500 }}>Learning Stage</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong>{learningCards}</strong> cards ({learningPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-easy)', display: 'inline-block' }}></span>
                      <span style={{ fontWeight: 500 }}>Mastered (Interval &ge; 7d)</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong>{reviewCards}</strong> cards ({reviewPercent.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Review forecast chart */}
              <div className="glass" style={{ padding: '20px' }}>
                <h4 style={{ marginBottom: '4px', fontSize: '1.05rem', fontWeight: 600 }}>Review Forecast</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '20px' }}>
                  Forecast of upcoming cards due for study over the next 7 days.
                </p>
                
                {Math.max(...dailySchedule) === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    No reviews scheduled for the next 7 days! 🎉
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '140px', paddingBottom: '20px', position: 'relative' }}>
                    {/* Grid lines */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                      <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.05)', width: '100%', height: 0 }}></div>
                      <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.05)', width: '100%', height: 0 }}></div>
                      <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.05)', width: '100%', height: 0 }}></div>
                    </div>
                    
                    {dailySchedule.map((count, idx) => {
                      const heightPercent = (count / Math.max(...dailySchedule, 1)) * 100;
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px', zIndex: 1 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: count > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {count}
                          </span>
                          <div style={{
                            width: '24px',
                            height: `${Math.max(heightPercent, 4)}px`,
                            background: count > 0 ? 'linear-gradient(to top, var(--primary), #a5b4fc)' : 'rgba(255,255,255,0.05)',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.3s ease',
                            boxShadow: count > 0 ? '0 0 12px var(--primary-glow)' : 'none'
                          }}></div>
                          <span style={{ fontSize: '0.7rem', color: idx === 0 ? 'var(--color-again)' : 'var(--text-secondary)', fontWeight: idx === 0 ? 600 : 400 }}>
                            {getDayLabel(idx)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                  There are <strong>{futureDue}</strong> cards scheduled beyond the next 7 days.
                </div>
              </div>

              {/* Ease Factor Distribution Profile */}
              <div className="glass" style={{ padding: '20px' }}>
                <h4 style={{ marginBottom: '4px', fontSize: '1.05rem', fontWeight: 600 }}>Card Difficulty Profile</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px' }}>
                  Ease factor values mapped to difficulty tiers (SM-2 Algorithm).
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Hard Ease */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-again)' }}></span>
                        <span>Hard (Ease &lt; 2.2)</span>
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {hardEase} {hardEase === 1 ? 'card' : 'cards'} ({totalCards > 0 ? ((hardEase / totalCards) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${totalCards > 0 ? (hardEase / Math.max(hardEase, midEase, easyEase, 1)) * 100 : 0}%`, 
                        background: 'linear-gradient(to right, var(--color-again), var(--color-hard))', 
                        borderRadius: '4px' 
                      }}></div>
                    </div>
                  </div>

                  {/* Medium Ease */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-good)' }}></span>
                        <span>Medium (Ease 2.2 - 2.8)</span>
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {midEase} {midEase === 1 ? 'card' : 'cards'} ({totalCards > 0 ? ((midEase / totalCards) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${totalCards > 0 ? (midEase / Math.max(hardEase, midEase, easyEase, 1)) * 100 : 0}%`, 
                        background: 'linear-gradient(to right, var(--color-good), var(--primary))', 
                        borderRadius: '4px' 
                      }}></div>
                    </div>
                  </div>

                  {/* Easy Ease */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-easy)' }}></span>
                        <span>Easy (Ease &gt; 2.8)</span>
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {easyEase} {easyEase === 1 ? 'card' : 'cards'} ({totalCards > 0 ? ((easyEase / totalCards) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${totalCards > 0 ? (easyEase / Math.max(hardEase, midEase, easyEase, 1)) * 100 : 0}%`, 
                        background: 'linear-gradient(to right, var(--color-easy), #34d399)', 
                        borderRadius: '4px' 
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer Container */}
      <div id="wowk-footer-container" style={{ width: '100%', marginTop: 'auto' }}></div>

      {/* Import Progress Overlay */}
      {isImporting && (
        <div className="progress-overlay">
          <div className="progress-card glass">
            <div className="progress-spinner-container">
              <div className="progress-spinner"></div>
              <Database className="progress-icon" size={28} />
            </div>
            
            <div className="progress-info">
              <h3 className="progress-title">Importowanie pytań...</h3>
              <p className="progress-subtitle">
                Zapisuję dane w bazie Firestore. Proszę nie zamykać aplikacji.
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
                  {importProgress.current} / {importProgress.total} pytań
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
