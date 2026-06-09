import { useState, useEffect, useRef } from 'react';
import { CheckCircle, RefreshCw, Settings, Eye, EyeOff, Infinity, LayoutDashboard, X } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import type { Deck, Card } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';

interface ReviewScreenProps {
  user: User;
  deck: Deck;
  onBack: () => void;
}

export function ReviewScreen({
  user,
  deck,
  onBack
}: ReviewScreenProps) {
  const { scoreCard, getDueCards, getCardsOnce } = useFirestore(user.uid);
  const [loading, setLoading] = useState(true);
  
  // Session queue for review cards
  const [sessionQueue, setSessionQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [foreverMode, setForeverMode] = useState<boolean>(() => {
    return localStorage.getItem('memocard_forever_mode') === 'true';
  });

  const [questionFontSize, setQuestionFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_question_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [answerFontSize, setAnswerFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_answer_font_size');
    return val ? parseInt(val, 10) : 28;
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  const handleToggleForeverMode = (val: boolean) => {
    setForeverMode(val);
    localStorage.setItem('memocard_forever_mode', String(val));
  };

  const [showStudyDetails, setShowStudyDetails] = useState<boolean>(() => {
    return localStorage.getItem('memocard_show_study_details') === 'true';
  });

  const handleToggleShowStudyDetails = (val: boolean) => {
    setShowStudyDetails(val);
    localStorage.setItem('memocard_show_study_details', String(val));
  };

  const calculateSRSResult = (card: Card | undefined, quality: number) => {
    if (!card) return { interval: 0, easeFactor: 2.5, easeDiff: 0 };
    
    let nextRepetitions = card.repetitions ?? 0;
    let nextInterval = card.interval ?? 0;
    let nextEaseFactor = card.easeFactor ?? 2.5;

    if (quality === 6) {
      return { interval: 999999, easeFactor: nextEaseFactor, easeDiff: 0 };
    }

    if (quality < 4) {
      nextRepetitions = 0;
      nextInterval = 1;
    } else {
      if (nextRepetitions === 0) {
        nextInterval = 1;
      } else if (nextRepetitions === 1) {
        nextInterval = 6;
      } else {
        nextInterval = Math.round(nextInterval * nextEaseFactor);
      }
    }

    const prevEaseFactor = nextEaseFactor;
    nextEaseFactor = nextEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (nextEaseFactor < 1.3) {
      nextEaseFactor = 1.3;
    }
    
    const easeDiff = nextEaseFactor - prevEaseFactor;

    return {
      interval: nextInterval,
      easeFactor: Number(nextEaseFactor.toFixed(2)),
      easeDiff: Number(easeDiff.toFixed(2))
    };
  };

  const renderStudyDetails = (card: Card | undefined, quality: number) => {
    const result = calculateSRSResult(card, quality);
    let intervalStr = '';
    if (result.interval === 999999) {
      intervalStr = 'na zawsze';
    } else if (result.interval === 1) {
      intervalStr = 'za 1 d';
    } else {
      intervalStr = `za ${result.interval} d`;
    }

    let easeStr = '';
    if (result.easeDiff > 0) {
      easeStr = `+${result.easeDiff}`;
    } else if (result.easeDiff < 0) {
      easeStr = `${result.easeDiff}`;
    } else {
      easeStr = 'b/z';
    }

    return (
      <span className="score-label" style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8, marginTop: '2px', fontWeight: 'normal', textTransform: 'none', lineHeight: 1.2 }}>
        {intervalStr}
        <span style={{ margin: '0 3px', opacity: 0.5 }}>•</span>
        <span style={{ color: result.easeDiff > 0 ? '#10b981' : result.easeDiff < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
          {easeStr}
        </span>
      </span>
    );
  };

  // States to hold the text of the card front and back faces currently visible to the user.
  // This prevents visual glitches/flashing of text when transitioning between cards.
  const [displayedFront, setDisplayedFront] = useState('');
  const [displayedBack, setDisplayedBack] = useState('');

  const currentCard = sessionQueue[currentIndex];
  const isFinished = !currentCard || currentIndex >= sessionQueue.length;

  const frontToShow = displayedFront || currentCard?.front || '';
  const backToShow = displayedBack || currentCard?.back || '';

  const backTimeoutRef = useRef<any>(null);
  const scoringRef = useRef(false);

  console.log("ReviewScreen render:", { 
    currentIndex, 
    isFlipped, 
    displayedFront, 
    displayedBack, 
    currentCardFront: currentCard?.front,
    sessionQueueLength: sessionQueue.length 
  });

  // Synchronize the displayed texts when the active card changes.
  useEffect(() => {
    console.log("useEffect [currentCard] running. currentCard:", currentCard?.front, "isFlipped:", isFlipped);
    if (currentCard) {
      setDisplayedFront(currentCard.front);
      
      // Clear any pending back text update
      if (backTimeoutRef.current) {
        clearTimeout(backTimeoutRef.current);
      }

      // If the card is already flipped, update the back text immediately.
      // Otherwise, delay updating it to avoid the text swap flicker while the back face is fading out.
      if (isFlipped) {
        setDisplayedBack(currentCard.back);
      } else {
        backTimeoutRef.current = setTimeout(() => {
          console.log("Timeout setDisplayedBack fired. Setting to:", currentCard.back);
          setDisplayedBack(currentCard.back);
          backTimeoutRef.current = null;
        }, 200);
      }
    }
    return () => {
      if (backTimeoutRef.current) {
        clearTimeout(backTimeoutRef.current);
      }
    };
  }, [currentCard]);

  // If the user flips the card to see the answer, immediately update the back text
  useEffect(() => {
    console.log("useEffect [isFlipped] running. isFlipped:", isFlipped, "displayedBack:", displayedBack, "currentCardBack:", currentCard?.back);
    if (isFlipped && currentCard && displayedBack !== currentCard.back) {
      if (backTimeoutRef.current) {
        clearTimeout(backTimeoutRef.current);
        backTimeoutRef.current = null;
      }
      setDisplayedBack(currentCard.back);
    }
  }, [isFlipped, currentCard, displayedBack]);


  // Touch gestures for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const dragOccurred = useRef(false);

  // Keyboard navigation states
  const [keyboardSwipeDirection, setKeyboardSwipeDirection] = useState<'left' | 'right' | 'up' | 'down' | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Check if the touch is on standard buttons to avoid overriding button clicks
    const target = e.target as HTMLElement;
    if (target.closest('.back-link') || target.closest('.btn') || target.closest('.btn-score')) {
      return;
    }

    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchCurrent({ x: touch.clientX, y: touch.clientY });
    setIsSwiping(true);
    dragOccurred.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || !isSwiping) return;
    
    const touch = e.touches[0];
    setTouchCurrent({ x: touch.clientX, y: touch.clientY });

    const diffX = Math.abs(touch.clientX - touchStart.x);
    const diffY = Math.abs(touch.clientY - touchStart.y);
    if (diffX > 10 || diffY > 10) {
      dragOccurred.current = true;
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchCurrent || !isSwiping) {
      resetSwipeState();
      return;
    }

    const diffX = touchCurrent.x - touchStart.x;
    const diffY = touchCurrent.y - touchStart.y;
    const threshold = 80; // Minimal swipe distance in pixels

    if (!isFlipped) {
      // If the card is not flipped yet, any swipe direction flips it to reveal the answer
      if (Math.abs(diffX) > threshold || Math.abs(diffY) > threshold) {
        setIsFlipped(true);
        resetSwipeState();
        setTimeout(() => {
          dragOccurred.current = false;
        }, 50);
        return;
      }
    } else {
      // If the card is flipped, swipe to score
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (Math.abs(diffX) > threshold) {
          if (diffX > 0) {
            handleScore(4); // Swipe Right -> Good (4)
          } else {
            handleScore(1); // Swipe Left -> Again (1)
          }
          resetSwipeState();
          setTimeout(() => {
            dragOccurred.current = false;
          }, 50);
          return;
        }
      } else {
        // Vertical swipe
        if (Math.abs(diffY) > threshold) {
          if (diffY > 0) {
            handleScore(3); // Swipe Down -> Hard (3)
          } else {
            handleScore(foreverMode ? 6 : 5); // Swipe Up -> Forever (6) or Easy (5)
          }
          resetSwipeState();
          setTimeout(() => {
            dragOccurred.current = false;
          }, 50);
          return;
        }
      }
    }

    resetSwipeState();
    setTimeout(() => {
      dragOccurred.current = false;
    }, 50);
  };

  const resetSwipeState = () => {
    setTouchStart(null);
    setTouchCurrent(null);
    setIsSwiping(false);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    console.log("handleCardClick triggered, isFlipped:", isFlipped, "dragOccurred:", dragOccurred.current);
    e.stopPropagation();
    if (dragOccurred.current) {
      return; // Prevent flip if they were swiping
    }
    setIsFlipped(!isFlipped);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    console.log("handleContainerClick triggered, isFlipped:", isFlipped);
    
    // Ignore clicks on links/buttons/interactive zones
    const target = e.target as HTMLElement;
    if (
      target.closest('.back-link') || 
      target.closest('.btn') || 
      target.closest('.btn-score') ||
      target.closest('.score-buttons-grid') ||
      target.closest('.review-actions-prompt')
    ) {
      return;
    }

    setIsFlipped(prev => !prev);
  };

  // Determine which border direction is active to highlight it
  const getActiveDirection = (): 'left' | 'right' | 'up' | 'down' | null => {
    if (!isFlipped) return null;
    if (keyboardSwipeDirection) return keyboardSwipeDirection;
    if (!touchStart || !touchCurrent || !isSwiping) return null;

    const diffX = touchCurrent.x - touchStart.x;
    const diffY = touchCurrent.y - touchStart.y;
    const threshold = 30; // Threshold from which we start highlighting borders

    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (Math.abs(diffX) > threshold) {
        return diffX > 0 ? 'right' : 'left';
      }
    } else {
      if (Math.abs(diffY) > threshold) {
        return diffY > 0 ? 'down' : 'up';
      }
    }
    return null;
  };

  const activeDirection = getActiveDirection();

  // Keyboard controls for review (Arrow keys)
  useEffect(() => {
    if (loading || isFinished) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!keys.includes(e.key)) return;

      e.preventDefault();

      if (!isFlipped) {
        // Any arrow key flips/reveals the card first
        setIsFlipped(true);
      } else {
        if (keyboardSwipeDirection) return; // Prevent double trigger

        let score = 4;
        let direction: 'left' | 'right' | 'up' | 'down' = 'right';

        if (e.key === 'ArrowLeft') {
          score = 1;
          direction = 'left';
        } else if (e.key === 'ArrowRight') {
          score = 4;
          direction = 'right';
        } else if (e.key === 'ArrowUp') {
          score = foreverMode ? 6 : 5;
          direction = 'up';
        } else if (e.key === 'ArrowDown') {
          score = 3;
          direction = 'down';
        }

        setKeyboardSwipeDirection(direction);

        // Score card after a brief visual delay to show the border highlight
        setTimeout(() => {
          handleScore(score);
          setKeyboardSwipeDirection(null);
        }, 250);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFlipped, currentIndex, loading, isFinished, keyboardSwipeDirection, foreverMode]);

  // Load and shuffle cards
  useEffect(() => {
    let isMounted = true;

    const loadReviewCards = async () => {
      try {
        let loadedCards = await getDueCards(deck.id);
        
        // If there are no due cards, or if the user is studying again, load all cards from the deck
        if (loadedCards.length === 0) {
          loadedCards = await getCardsOnce(deck.id);
        }

        if (!isMounted) return;

        // Shuffle cards
        const shuffled = [...loadedCards].sort(() => Math.random() - 0.5);

        setSessionQueue(shuffled);
        setLoading(false);
      } catch (err) {
        console.error("Error loading cards for review:", err);
        if (isMounted) setLoading(false);
      }
    };

    loadReviewCards();

    return () => {
      isMounted = false;
    };
  }, [deck.id, getDueCards, getCardsOnce, resetCount]);

  const handleScore = async (quality: number) => {
    console.log("handleScore called. Card:", currentCard?.front, "Quality:", quality);
    if (scoringRef.current || !currentCard) return;
    scoringRef.current = true;

    dragOccurred.current = false;

    // Keep the old back text temporarily during the transition to avoid text swap flicker
    setDisplayedBack(currentCard.back);

    try {
      // Persist card score to database
      console.log("Calling scoreCard for:", currentCard.id);
      const deckHasStats = deck.masteredCount !== undefined && deck.easeCount !== undefined;
      await scoreCard(deck.id, currentCard.id, currentCard, quality, deckHasStats);
      console.log("scoreCard returned for:", currentCard.id);

      // Update queue/completed count immediately
      if (quality === 1) {
        // If "Again" (forgotten), put the card at the end of the current session queue
        setSessionQueue(prev => [...prev, currentCard]);
      } else {
        setCompletedCount(prev => prev + 1);
      }

      // Flip card back to front immediately
      console.log("Setting isFlipped to false");
      setIsFlipped(false);

      // Advance to the next card immediately without delay
      console.log("Advancing currentIndex from:", currentIndex);
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error("Error during scoring:", err);
    } finally {
      scoringRef.current = false;
    }
  };

  const handleResetSession = () => {
    setLoading(true);
    setCurrentIndex(0);
    setCompletedCount(0);
    setIsFlipped(false);
    setDisplayedFront('');
    setDisplayedBack('');
    setResetCount(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div 
      className="container"
      onClick={handleContainerClick}
      style={{ cursor: !isFlipped ? 'pointer' : 'default', minHeight: '100vh' }}
    >
      {/* Navigation Header */}
      <div 
        className="navigation-bar glass" 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          width: '100%',
          padding: '8px 16px',
          borderRadius: '16px',
          marginBottom: '24px',
          border: '1px solid var(--border-light)',
          background: 'rgba(255, 255, 255, 0.02)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Side: Exit/Dashboard Shortcut */}
        <button 
          className="back-link" 
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            transition: 'color 0.2s ease',
            padding: '4px 8px'
          }}
          title="Powrót do zarządzania talią"
        >
          <LayoutDashboard size={18} />
          <span style={{ display: 'inline-block' }}>Talia: <strong>{deck.name}</strong></span>
        </button>

        {/* Right Side: Toolbar cluster (details, forever mode, settings) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Details (Eye icon button) */}
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggleShowStudyDetails(!showStudyDetails); }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              borderRadius: '50%',
              background: showStudyDetails ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${showStudyDetails ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-light)'}`,
              color: showStudyDetails ? 'var(--primary)' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
            title={showStudyDetails ? "Ukryj szczegóły powtórek" : "Pokaż szczegóły powtórek"}
          >
            {showStudyDetails ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>

          {/* Forever Mode (Infinity icon button) */}
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggleForeverMode(!foreverMode); }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              borderRadius: '50%',
              background: foreverMode ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.02)',
              border: `1px solid ${foreverMode ? 'rgba(168, 85, 247, 0.4)' : 'var(--border-light)'}`,
              color: foreverMode ? 'var(--color-forever)' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
            title={foreverMode ? "Wyłącz Forever Mode" : "Włącz Forever Mode"}
          >
            <Infinity size={18} />
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }}></div>

          {/* Settings gear icon */}
          <button 
            type="button"
            className="settings-btn"
            onClick={(e) => { e.stopPropagation(); setShowSettingsModal(true); }}
            style={{ 
              width: '36px',
              height: '36px',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)'
            }}
            title="Ustawienia nauki"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {isFinished ? (
        <div className="empty-state glass animate-fade-in" style={{ padding: '48px 24px' }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', margin: '0 auto 24px' }}>
            <CheckCircle size={40} />
          </div>
          <h2 className="login-title" style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Great Job!</h2>
          <p className="login-subtitle" style={{ marginBottom: '24px' }}>
            All scheduled reviews for the deck <strong>{deck.name}</strong> have been completed for today.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', width: '100%', maxWidth: '320px' }}>
            <button className="btn btn-secondary" onClick={onBack}>
              Back to Decks
            </button>
            <button className="btn btn-primary" onClick={handleResetSession}>
              <RefreshCw size={16} />
              Study Again
            </button>
          </div>
        </div>
      ) : (
        <div 
          className="review-session-container"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
        >
          {/* Progress Indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>Review Session: {completedCount} completed</span>
            <span>Remaining: {sessionQueue.length - currentIndex} {sessionQueue.length - currentIndex === 1 ? 'card' : 'cards'}</span>
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${(currentIndex / sessionQueue.length) * 100}%` }}
            ></div>
          </div>

          {/* Flashcard Component */}
          <div 
            className={`flashcard-container ${isFlipped ? 'is-flipped' : ''} ${activeDirection ? `swipe-active-${activeDirection}` : ''} ${foreverMode ? 'forever-mode-active' : ''}`}
            onClick={handleCardClick}
          >
            <div className="flashcard-inner">
              {!isFlipped ? (
                /* Front Face */
                <div className="flashcard-face flashcard-front">
                  <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>{frontToShow}</span>
                </div>
              ) : (
                /* Back Face */
                <div className="flashcard-face flashcard-back" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '52px' }}>
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    right: '20px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    opacity: 0.7,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingBottom: '8px',
                    fontStyle: 'italic'
                  }}>
                    {frontToShow}
                  </div>
                  <span className="flashcard-text" style={{ fontSize: `${answerFontSize}px` }}>{backToShow}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Grid */}
          {!isFlipped ? (
            <div className="review-actions-prompt">
              Tap anywhere on the screen to show answer.
            </div>
          ) : (
            <div className="animate-fade-in">
              <div style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                How well did you remember this card?
              </div>
              <div className="score-buttons-grid">
                {foreverMode ? (
                  <>
                    <button className="btn-score btn-forever" onClick={() => handleScore(6)}>
                      <strong>Forever</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 6)}
                    </button>
                    <button className="btn-score btn-good" onClick={() => handleScore(4)}>
                      <strong>Good</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 4)}
                    </button>
                    <button className="btn-score btn-hard" onClick={() => handleScore(3)}>
                      <strong>Hard</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 3)}
                    </button>
                    <button className="btn-score btn-again" onClick={() => handleScore(1)}>
                      <strong>Again</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 1)}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-score btn-again" onClick={() => handleScore(1)}>
                      <strong>Again</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 1)}
                    </button>
                    <button className="btn-score btn-hard" onClick={() => handleScore(3)}>
                      <strong>Hard</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 3)}
                    </button>
                    <button className="btn-score btn-good" onClick={() => handleScore(4)}>
                      <strong>Good</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 4)}
                    </button>
                    <button className="btn-score btn-easy" onClick={() => handleScore(5)}>
                      <strong>Easy</strong>
                      {showStudyDetails && renderStudyDetails(currentCard, 5)}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* App Settings Modal in ReviewScreen */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); setShowSettingsModal(false); }}>
          <div className="modal-content glass animate-fade-in" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} style={{ color: 'var(--primary)' }} />
                Ustawienia nauki
              </h3>
              <button className="close-btn" onClick={() => setShowSettingsModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Question Font Size Slider */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Rozmiar czcionki pytania</label>
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
                  <label className="form-label" style={{ marginBottom: 0 }}>Rozmiar czcionki odpowiedzi</label>
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

              {/* Toggle details directly in settings */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ paddingRight: '16px' }}>
                  <label className="form-label" style={{ marginBottom: '2px', cursor: 'pointer', display: 'block' }}>Pokazuj szczegóły powtórek na przyciskach</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, margin: 0, lineHeight: '1.3' }}>Wyświetla czas do kolejnej powtórki oraz zmianę wskaźnika łatwości (SM-2).</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={showStudyDetails} 
                  onChange={(e) => handleToggleShowStudyDetails(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Toggle forever mode directly in settings */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ paddingRight: '16px' }}>
                  <label className="form-label" style={{ marginBottom: '2px', cursor: 'pointer', display: 'block' }}>Tryb Forever Mode</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, margin: 0, lineHeight: '1.3' }}>Pozwala na trwałe oznaczenie kart jako zapamiętanych (9999 rok).</p>
                </div>
                <input 
                  type="checkbox" 
                  checked={foreverMode} 
                  onChange={(e) => handleToggleForeverMode(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--color-forever)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Visualization of the card */}
              <div style={{ marginTop: '10px' }}>
                <span className="form-label" style={{ marginBottom: '10px' }}>Podgląd karty</span>
                
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
                    Pytanie (Awers)
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
                    Odpowiedź (Rewers)
                  </button>
                </div>

                {/* Card Container Preview */}
                <div 
                  className={`flashcard-container ${previewSide === 'back' ? 'is-flipped' : ''}`}
                  style={{ 
                    height: 'auto', 
                    minHeight: '160px', 
                    marginBottom: 0, 
                    pointerEvents: 'none'
                  }}
                >
                  <div className="flashcard-inner" style={{ height: 'auto', minHeight: 'inherit' }}>
                    {previewSide === 'front' ? (
                      /* Front preview */
                      <div className="flashcard-face flashcard-front" style={{ minHeight: '160px', height: 'auto', padding: '20px' }}>
                        <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>
                          Jak nazywa się stolica Francji?
                        </span>
                      </div>
                    ) : (
                      /* Back preview */
                      <div className="flashcard-face flashcard-back" style={{ minHeight: '160px', height: 'auto', padding: '20px', paddingTop: '45px' }}>
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
                          Jak nazywa się stolica Francji?
                        </div>
                        <span className="flashcard-text" style={{ fontSize: `${answerFontSize}px` }}>
                          Paryż
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
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
