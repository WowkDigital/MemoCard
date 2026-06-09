import { useState, useEffect } from 'react';
import { Plus, LogOut, BookOpen, Settings, X, Layers, RefreshCw, User as UserIcon, SlidersHorizontal, Database, Sparkles } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import type { Deck, Card } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';

declare const __APP_VERSION__: string;

interface DashboardScreenProps {
  user: User;
  onLogout: () => void;
  onSelectDeck: (deck: Deck) => void;
  onStartReview: (deck: Deck) => void;
  onNavigateToAddDeck: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function DashboardScreen({
  user,
  onLogout,
  onSelectDeck,
  onStartReview,
  onNavigateToAddDeck,
  showToast
}: DashboardScreenProps) {
  const { decks, loadingDecks, cloneSharedDeck, getCardsOnce, getDueCount, healDeckStats } = useFirestore(user.uid);
  
  const [deckStats, setDeckStats] = useState<Record<string, { total: number; due: number; mastered: number; ease: string }>>({});
  const [expandedDecks, setExpandedDecks] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<string>(() => {
    return localStorage.getItem('memocard_sort_by') || 'recommended';
  });
  const [isSortOpen, setIsSortOpen] = useState(false);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    localStorage.setItem('memocard_sort_by', newSort);
  };

  const toggleSortDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSortOpen(prev => !prev);
  };

  useEffect(() => {
    if (!isSortOpen) return;
    const handleClose = () => setIsSortOpen(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [isSortOpen]);

  const sortOptions = [
    { value: 'recommended', label: 'Study (Suggested)', icon: '💡' },
    { value: 'due-desc', label: 'Due Reviews (Most)', icon: '📅' },
    { value: 'total-desc', label: 'Card Count (Most)', icon: '📚' },
    { value: 'name-asc', label: 'Name (A-Z)', icon: '🔤' },
    { value: 'name-desc', label: 'Name (Z-A)', icon: '🔤' },
    { value: 'created-desc', label: 'Newest', icon: '🆕' },
    { value: 'created-asc', label: 'Oldest', icon: '⏳' },
  ];

  const currentOption = sortOptions.find(o => o.value === sortBy) || sortOptions[0];

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

      // Check if deck has the precalculated stats
      const hasStatsInDeck = deck.easeCount !== undefined && deck.masteredCount !== undefined;

      if (hasStatsInDeck) {
        // Fetch ONLY the count of due cards (uses server-side aggregation - extremely cheap and fast!)
        getDueCount(deck.id).then((due) => {
          const total = deck.cardCount || 0;
          const mastered = deck.masteredCount || 0;
          const easeCount = deck.easeCount || 0;
          const totalEase = deck.totalEaseFactor || 0;
          const ease = easeCount > 0 ? (totalEase / easeCount).toFixed(2) : '2.50';

          setDeckStats(prev => ({
            ...prev,
            [deck.id]: { total, due, mastered, ease }
          }));
        }).catch((err) => {
          console.error("Error fetching due count:", err);
        });
      } else {
        // Fallback for old/unmigrated decks: fetch cards, calculate stats, and trigger background self-healing/migration
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
                : new Date((card.nextReview as unknown as { seconds: number }).seconds * 1000);
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

          // Self-heal/migrate the deck metadata doc in Firestore
          healDeckStats(deck.id, {
            masteredCount: mastered,
            easeCount: easeCount,
            totalEaseFactor: totalEase
          });
        });
      }
    });
  }, [decks, loadingDecks, getDueCount, getCardsOnce, healDeckStats]);


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
      const ca = deck.createdAt as unknown as { seconds?: number } | Date;
      if (ca instanceof Date) {
        date = ca;
      } else if (ca && typeof ca === 'object' && 'seconds' in ca && typeof ca.seconds === 'number') {
        date = new Date(ca.seconds * 1000);
      } else {
        date = new Date(ca as unknown as string);
      }
    }
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // API key state (synced with localStorage)
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('google_ai_api_key') || '');

  // App settings states
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Sync key when modal opens
  useEffect(() => {
    if (showSettingsModal) {
      setGoogleApiKey(localStorage.getItem('google_ai_api_key') || '');
    }
  }, [showSettingsModal]);
  
  const [questionFontSize, setQuestionFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_question_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [answerFontSize, setAnswerFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_answer_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [showStudyDetails, setShowStudyDetails] = useState<boolean>(() => {
    return localStorage.getItem('memocard_show_study_details') === 'true';
  });

  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<{ current: number; total: number } | null>(null);

  const handleSelectDeckClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      setIsCloning(true);
      setCloneProgress({ current: 0, total: deck.cardCount || 0 });
      try {
        await cloneSharedDeck(deck.ownerId, deck.id, (progress) => {
          setCloneProgress({ current: progress, total: deck.cardCount || 0 });
        });
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        showToast('Deck cloned successfully!', 'success');
        onSelectDeck(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck.', 'error');
      } finally {
        setIsCloning(false);
        setCloneProgress(null);
      }
    } else {
      onSelectDeck(deck);
    }
  };

  const handleStartReviewClick = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      setIsCloning(true);
      setCloneProgress({ current: 0, total: deck.cardCount || 0 });
      try {
        await cloneSharedDeck(deck.ownerId, deck.id, (progress) => {
          setCloneProgress({ current: progress, total: deck.cardCount || 0 });
        });
        const clonedDeck = { ...deck, isShared: false, ownerId: user.uid };
        showToast('Deck cloned successfully!', 'success');
        onStartReview(clonedDeck);
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck for studying.', 'error');
      } finally {
        setIsCloning(false);
        setCloneProgress(null);
      }
    } else {
      onStartReview(deck);
    }
  };



  // Sort decks dynamically based on selected criteria
  const sortedDecks = [...decks].sort((a, b) => {
    if (sortBy === 'recommended') {
      const dueA = deckStats[a.id]?.due ?? 0;
      const dueB = deckStats[b.id]?.due ?? 0;
      
      // 1. Decks with due cards first (more due cards first)
      if (dueA > 0 && dueB === 0) return -1;
      if (dueB > 0 && dueA === 0) return 1;
      if (dueA > 0 && dueB > 0 && dueA !== dueB) {
        return dueB - dueA;
      }
      
      // 2. If no due cards, check unmastered cards (total - mastered)
      const totalA = deckStats[a.id]?.total ?? a.cardCount ?? 0;
      const totalB = deckStats[b.id]?.total ?? b.cardCount ?? 0;
      
      // Decks with 0 cards go to the bottom
      if (totalA === 0 && totalB > 0) return 1;
      if (totalB === 0 && totalA > 0) return -1;
      
      const masteredA = deckStats[a.id]?.mastered ?? 0;
      const masteredB = deckStats[b.id]?.mastered ?? 0;
      const unmasteredA = totalA - masteredA;
      const unmasteredB = totalB - masteredB;
      
      if (unmasteredA !== unmasteredB) {
        return unmasteredB - unmasteredA;
      }
      
      // 3. Sort by ease factor ascending (lower ease = more difficult = study first)
      const easeA = parseFloat(deckStats[a.id]?.ease ?? '2.50');
      const easeB = parseFloat(deckStats[b.id]?.ease ?? '2.50');
      if (easeA !== easeB) {
        return easeA - easeB;
      }
    }
    
    if (sortBy === 'due-desc') {
      const dueA = deckStats[a.id]?.due ?? 0;
      const dueB = deckStats[b.id]?.due ?? 0;
      if (dueA !== dueB) return dueB - dueA;
    }
    
    if (sortBy === 'total-desc') {
      const totalA = deckStats[a.id]?.total ?? a.cardCount ?? 0;
      const totalB = deckStats[b.id]?.total ?? b.cardCount ?? 0;
      if (totalA !== totalB) return totalB - totalA;
    }

    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }

    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }

    const getMs = (deck: Deck) => {
      if (!deck.createdAt) return 0;
      if (typeof deck.createdAt.toDate === 'function') return deck.createdAt.toDate().getTime();
      const ca = deck.createdAt as unknown as { seconds?: number } | Date;
      if (ca instanceof Date) return ca.getTime();
      if (ca && typeof ca === 'object' && 'seconds' in ca && typeof ca.seconds === 'number') return ca.seconds * 1000;
      return new Date(ca as unknown as string).getTime();
    };

    if (sortBy === 'created-desc') {
      return getMs(b) - getMs(a);
    }

    if (sortBy === 'created-asc') {
      return getMs(a) - getMs(b);
    }

    // Default secondary sort: own first, then shared
    if (a.isShared && !b.isShared) return 1;
    if (!a.isShared && b.isShared) return -1;
    
    return a.name.localeCompare(b.name);
  });

  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, d) => sum + (deckStats[d.id]?.total ?? d.cardCount ?? 0), 0);
  const totalDue = decks.reduce((sum, d) => sum + (deckStats[d.id]?.due ?? 0), 0);
  const totalMastered = decks.reduce((sum, d) => sum + (deckStats[d.id]?.mastered ?? d.masteredCount ?? 0), 0);
  const totalEaseFactor = decks.reduce((sum, d) => sum + (d.totalEaseFactor ?? 0), 0);
  const totalEaseCount = decks.reduce((sum, d) => sum + (d.easeCount ?? 0), 0);
  const avgEase = totalEaseCount > 0 ? (totalEaseFactor / totalEaseCount).toFixed(2) : '2.50';
  const masteryRate = totalCards > 0 ? Math.round((totalMastered / totalCards) * 100) : 0;

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
          <button 
            className="settings-btn" 
            onClick={() => setShowSettingsModal(true)} 
            title="Ustawienia aplikacji"
          >
            <Settings size={18} />
          </button>
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
        {/* Global Stats Dashboard */}
        {decks.length > 0 && (
          <div className="stats-dashboard glass" style={{
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%)',
            border: '1px solid var(--border-light)',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} style={{ color: 'var(--primary)' }} />
              Globalne Statystyki Nauki
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '16px'
            }}>
              {/* Stat 1: Total Decks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Liczba talii</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--text-primary)', fontWeight: 700 }}>{totalDecks}</strong>
              </div>

              {/* Stat 2: Total Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unikalne fiszki</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--primary)', fontWeight: 700 }}>{totalCards}</strong>
              </div>

              {/* Stat 3: Due Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Do powtórki</span>
                <strong style={{ fontSize: '1.6rem', color: totalDue > 0 ? 'var(--color-again)' : 'var(--color-easy)', fontWeight: 700 }}>
                  {totalDue}
                </strong>
              </div>

              {/* Stat 4: Mastered Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Opanowane fiszki</span>
                <strong style={{ fontSize: '1.6rem', color: 'var(--color-easy)', fontWeight: 700 }}>
                  {totalMastered} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>({masteryRate}%)</span>
                </strong>
              </div>

              {/* Stat 5: Avg Ease */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Średni wskaźnik łatwości</span>
                <strong style={{ fontSize: '1.6rem', color: '#c084fc', fontWeight: 700 }}>{avgEase}</strong>
              </div>
            </div>

            {totalCards > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>Poziom Opanowania Materiału</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-easy)' }}>{masteryRate}% ({totalMastered} z {totalCards})</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${masteryRate}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--primary) 0%, var(--color-easy) 100%)',
                    borderRadius: '3px',
                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}></div>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="section-title">
          <h2>Your Decks</h2>
          <div className="section-actions" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={onNavigateToAddDeck}
            >
              <Plus size={16} />
              Add Deck
            </button>
          </div>
        </div>

        {/* Sorting Toolbar */}
        {decks.length > 0 && (
          <div className="sort-bar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            fontSize: '0.85rem',
            position: 'relative'
          }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
              <SlidersHorizontal size={14} style={{ color: 'var(--primary)' }} />
              Sortowanie
            </span>
            
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={toggleSortDropdown}
                className="glass"
                style={{
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.2s ease',
                  userSelect: 'none',
                  fontWeight: 500
                }}
              >
                <span>{currentOption.icon}</span>
                <span>{currentOption.label}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '4px' }}>▼</span>
              </button>

              {isSortOpen && (
                <div 
                  className="glass animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 100,
                    minWidth: '220px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-light)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(16px)',
                    background: 'rgba(15, 23, 42, 0.95)'
                  }}
                >
                  {sortOptions.map((opt) => {
                    const isSelected = opt.value === sortBy;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          handleSortChange(opt.value);
                          setIsSortOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                          fontSize: '0.85rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          fontWeight: isSelected ? 600 : 400
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span>{opt.icon}</span>
                        <span style={{ flex: 1 }}>{opt.label}</span>
                        {isSelected && <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {loadingDecks ? (
          <div className="loading-spinner"></div>
        ) : decks.length === 0 ? (
          <div className="empty-state glass">
            <Layers size={48} className="empty-icon" />
            <p className="empty-text">You do not have any flashcard decks yet.</p>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={onNavigateToAddDeck}>
              Create your first deck
            </button>
          </div>
        ) : (
          <div className="deck-list">
            {sortedDecks.map((deck) => {
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
                      {(deckStats[deck.id]?.due ?? 0) > 0 && (
                        <span className="review-badge" style={{ 
                          background: 'rgba(239, 68, 68, 0.15)', 
                          color: '#f87171', 
                          fontSize: '0.7rem', 
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          animation: 'pulse 2s infinite ease-in-out'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                          Do nauki
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
                    
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {isExpanded ? (
                        <>
                          <button 
                            className="btn btn-secondary" 
                            style={{ 
                              padding: '0 12px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              borderRadius: '8px', 
                              fontSize: '0.8rem',
                              width: 'auto'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDeckClick(deck);
                            }}
                            title="Dodawanie, edycja i generowanie fiszek przez AI"
                          >
                            <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                            <span>Zarządzaj & AI</span>
                          </button>
                          <button 
                            className="btn btn-primary" 
                            style={{ 
                              padding: '0 12px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              borderRadius: '8px', 
                              fontSize: '0.8rem',
                              width: 'auto'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartReviewClick(deck);
                            }}
                            disabled={(deckStats[deck.id]?.total ?? deck.cardCount) === 0}
                          >
                            <BookOpen size={14} />
                            <span>Ucz się</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDeckClick(deck);
                            }}
                            title="Zarządzaj fiszkami i AI"
                          >
                            <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                          </button>
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartReviewClick(deck);
                            }}
                            disabled={(deckStats[deck.id]?.total ?? deck.cardCount) === 0}
                            title={(deckStats[deck.id]?.total ?? deck.cardCount) === 0 ? "Brak kart do nauki" : "Rozpocznij naukę"}
                          >
                            <BookOpen size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>


      {/* Clone Progress Overlay */}
      {isCloning && (
        <div className="progress-overlay">
          <div className="progress-card glass">
            <div className="progress-spinner-container">
              <div className="progress-spinner"></div>
              <Database className="progress-icon" size={28} />
            </div>
            
            <div className="progress-info">
              <h3 className="progress-title">Cloning deck...</h3>
              <p className="progress-subtitle">
                Saving data to Firestore. Please do not close the application.
              </p>
            </div>

            {cloneProgress && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span className="progress-percentage">
                  {Math.round((cloneProgress.current / (cloneProgress.total || 1)) * 100)}%
                </span>
                <div className="progress-bar-wrapper">
                  <div 
                    className="progress-bar-fill-animated"
                    style={{ 
                      width: `${Math.round((cloneProgress.current / (cloneProgress.total || 1)) * 100)}%` 
                    }}
                  ></div>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {cloneProgress.current} / {cloneProgress.total} cards
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* App Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content glass animate-fade-in" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} style={{ color: 'var(--primary)' }} />
                Application Settings
              </h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Question Font Size Slider */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Question font size</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{questionFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="16" 
                  max="48" 
                  value={questionFontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuestionFontSize(val);
                    localStorage.setItem('memocard_question_font_size', String(val));
                  }}
                  style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Answer Font Size Slider */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Answer font size</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>{answerFontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="16" 
                  max="48" 
                  value={answerFontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setAnswerFontSize(val);
                    localStorage.setItem('memocard_answer_font_size', String(val));
                  }}
                  style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Show Study Details Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ paddingRight: '16px' }}>
                  <label className="form-label" style={{ marginBottom: '2px', cursor: 'pointer', display: 'block' }}>Show SRS details on buttons</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, margin: 0, lineHeight: '1.3' }}>Displays time to next review and change in ease factor (SM-2).</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={showStudyDetails} 
                  onChange={(e) => {
                    const val = e.target.checked;
                    setShowStudyDetails(val);
                    localStorage.setItem('memocard_show_study_details', String(val));
                  }}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Google AI API Key Input */}
              <div className="form-group" style={{ marginBottom: 0, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                <label className="form-label" style={{ marginBottom: '6px' }}>Google AI API Key</label>
                <input 
                  type="password" 
                  value={googleApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGoogleApiKey(val);
                    localStorage.setItem('google_ai_api_key', val.trim());
                  }}
                  placeholder="AIzaSy..."
                  className="form-control"
                  style={{ width: '100%' }}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7, marginTop: '4px', marginBottom: 0 }}>
                  Used for deck generation with Gemini AI models.
                </p>
              </div>

              {/* Visualization of the card */}
              <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                <span className="form-label" style={{ marginBottom: '10px' }}>Card preview</span>
                
                {/* Tabs to select Front / Back preview */}
                <div style={{
                  display: 'flex',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '10px',
                  padding: '3px',
                  marginBottom: '12px'
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
                    minHeight: '200px', 
                    marginBottom: 0, 
                    pointerEvents: 'none'
                  }}
                >
                  <div className="flashcard-inner" style={{ height: 'auto', minHeight: 'inherit' }}>
                    {previewSide === 'front' ? (
                      /* Front preview */
                      <div className="flashcard-face flashcard-front" style={{ minHeight: '200px', height: 'auto', padding: '20px' }}>
                        <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>
                          What is the capital of France?
                        </span>
                      </div>
                    ) : (
                      /* Back preview */
                      <div className="flashcard-face flashcard-back" style={{ minHeight: '200px', height: 'auto', padding: '20px', paddingTop: '45px' }}>
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

              <div className="form-actions" style={{ marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: '100%' }}
                  onClick={() => setShowSettingsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
