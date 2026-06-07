import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, RefreshCw } from 'lucide-react';
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
  const { scoreCard, getCardsOnce } = useFirestore(user.uid);
  const [loading, setLoading] = useState(true);
  
  // Session queue for review cards
  const [sessionQueue, setSessionQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [foreverMode, setForeverMode] = useState<boolean>(() => {
    return localStorage.getItem('memocard_forever_mode') === 'true';
  });

  const [questionFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_question_font_size');
    return val ? parseInt(val, 10) : 28;
  });
  const [answerFontSize] = useState<number>(() => {
    const val = localStorage.getItem('memocard_answer_font_size');
    return val ? parseInt(val, 10) : 28;
  });

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
        const loadedCards = await getCardsOnce(deck.id);
        if (!isMounted) return;

        const now = new Date();
        // Filter cards that are due for review
        const due = loadedCards.filter(card => {
          if (!card.nextReview) return true;
          const reviewDate = typeof card.nextReview.toDate === 'function'
            ? card.nextReview.toDate()
            : new Date((card.nextReview as any).seconds * 1000);
          return reviewDate <= now;
        });

        // Shuffle due cards
        const shuffledDue = [...due].sort(() => Math.random() - 0.5);

        setSessionQueue(shuffledDue);
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
  }, [deck.id]); // eslint-disable-next-line react-hooks/exhaustive-deps

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
      await scoreCard(deck.id, currentCard.id, currentCard, quality);
      console.log("scoreCard returned for:", currentCard.id);

      // Update queue/completed count immediately
      if (quality < 4) {
        // If wrong or hard answer, put the card at the end of the current session queue
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
      {/* Navigation */}
      <div className="navigation-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <button className="back-link" onClick={(e) => { e.stopPropagation(); onBack(); }}>
          <ArrowLeft size={16} />
          <span>End Session</span>
        </button>

        {/* Remembered Forever Mode Toggle & Details Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Details toggle */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            userSelect: 'none',
            background: showStudyDetails ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${showStudyDetails ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-light)'}`,
            padding: '6px 12px',
            borderRadius: '99px',
            transition: 'all 0.2s ease',
          }}>
            <input 
              type="checkbox" 
              checked={showStudyDetails}
              onChange={(e) => handleToggleShowStudyDetails(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--primary)' }}
            />
            <span style={{ fontWeight: 500, color: showStudyDetails ? 'var(--primary)' : 'var(--text-primary)' }}>
              Szczegóły
            </span>
          </label>

          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            userSelect: 'none',
            background: foreverMode ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            border: `1px solid ${foreverMode ? 'rgba(168, 85, 247, 0.3)' : 'var(--border-light)'}`,
            padding: '6px 12px',
            borderRadius: '99px',
            transition: 'all 0.2s ease',
          }}>
            <input 
              type="checkbox" 
              checked={foreverMode}
              onChange={(e) => handleToggleForeverMode(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--color-forever)' }}
            />
            <span style={{ fontWeight: 500, color: foreverMode ? 'var(--color-forever)' : 'var(--text-primary)' }}>
              Forever Mode
            </span>
          </label>
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
              {/* Front Face */}
              <div className="flashcard-face flashcard-front">
                <span className="flashcard-text" style={{ fontSize: `${questionFontSize}px` }}>{frontToShow}</span>
              </div>
              
              {/* Back Face */}
              <div className="flashcard-face flashcard-back" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', paddingTop: '52px' }}>
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
    </div>
  );
}
