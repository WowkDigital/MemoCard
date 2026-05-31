import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, RefreshCw } from 'lucide-react';
import type { Deck, Card } from '../hooks/useFirestore';

interface ReviewScreenProps {
  deck: Deck;
  onBack: () => void;
  scoreCard: (deckId: string, cardId: string, currentCard: Card, quality: number) => Promise<void>;
  subscribeToCards: (deckId: string, callback: (cards: Card[]) => void) => () => void;
}

export function ReviewScreen({
  deck,
  onBack,
  scoreCard,
  subscribeToCards
}: ReviewScreenProps) {
  const [loading, setLoading] = useState(true);
  
  // Session queue for review cards
  const [sessionQueue, setSessionQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const currentCard = sessionQueue[currentIndex];
  const isFinished = !currentCard || currentIndex >= sessionQueue.length;

  // Touch gestures for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const dragOccurred = useRef(false);

  // Keyboard navigation states
  const [keyboardSwipeDirection, setKeyboardSwipeDirection] = useState<'left' | 'right' | 'up' | 'down' | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Gestures are only active when card is flipped (showing answer)
    if (!isFlipped) return;
    
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
          handleScore(5); // Swipe Up -> Easy (5)
        }
        resetSwipeState();
        setTimeout(() => {
          dragOccurred.current = false;
        }, 50);
        return;
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
    e.stopPropagation();
    if (dragOccurred.current) {
      return; // Prevent flip if they were swiping
    }
    setIsFlipped(!isFlipped);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // If the card is already flipped, click on background does nothing
    if (isFlipped) return;
    
    // Ignore clicks on links/buttons
    const target = e.target as HTMLElement;
    if (target.closest('.back-link') || target.closest('.btn-secondary') || target.closest('.btn-primary')) return;

    setIsFlipped(true);
  };

  // Determine which border direction is active to highlight it
  const getActiveDirection = (): 'left' | 'right' | 'up' | 'down' | null => {
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
          score = 5;
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
  }, [isFlipped, currentIndex, loading, isFinished, keyboardSwipeDirection]);

  // Load and shuffle cards
  useEffect(() => {
    const unsubscribe = subscribeToCards(deck.id, (loadedCards) => {
      const now = new Date();
      // Filter cards that are due for review
      const due = loadedCards.filter(card => {
        if (!card.nextReview) return true;
        const reviewDate = card.nextReview.toDate();
        return reviewDate <= now;
      });

      // Shuffle due cards
      const shuffledDue = [...due].sort(() => Math.random() - 0.5);

      if (loading) {
        setSessionQueue(shuffledDue);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [deck.id, subscribeToCards, loading]);

  const handleScore = async (quality: number) => {
    if (!currentCard) return;

    dragOccurred.current = false;

    // Persist card score to database
    await scoreCard(deck.id, currentCard.id, currentCard, quality);

    // Flip card back to front
    setIsFlipped(false);

    // Brief delay to allow the fade transition to reset before showing next card
    setTimeout(() => {
      if (quality < 4) {
        // If wrong or hard answer, put the card at the end of the current session queue
        setSessionQueue(prev => [...prev, currentCard]);
      } else {
        setCompletedCount(prev => prev + 1);
      }
      
      setCurrentIndex(prev => prev + 1);
    }, 150);
  };

  const handleResetSession = () => {
    setLoading(true);
    setCurrentIndex(0);
    setCompletedCount(0);
    setIsFlipped(false);
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
      <div className="navigation-bar">
        <button className="back-link" onClick={(e) => { e.stopPropagation(); onBack(); }}>
          <ArrowLeft size={16} />
          <span>End Session</span>
        </button>
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
            className={`flashcard-container ${isFlipped ? 'is-flipped' : ''} ${activeDirection ? `swipe-active-${activeDirection}` : ''}`}
            onClick={handleCardClick}
          >
            <div className="flashcard-inner">
              {/* Front Face */}
              <div className="flashcard-face flashcard-front">
                <span className="flashcard-text">{currentCard.front}</span>
              </div>
              
              {/* Back Face */}
              <div className="flashcard-face flashcard-back">
                <span className="flashcard-text">{currentCard.back}</span>
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
                <button className="btn-score btn-again" onClick={() => handleScore(1)}>
                  <strong>Again</strong>
                  <span className="score-label">Reset<span className="shortcut-hint"> (⬅️ left)</span></span>
                </button>
                <button className="btn-score btn-hard" onClick={() => handleScore(3)}>
                  <strong>Hard</strong>
                  <span className="score-label">Hard<span className="shortcut-hint"> (⬇️ down)</span></span>
                </button>
                <button className="btn-score btn-good" onClick={() => handleScore(4)}>
                  <strong>Good</strong>
                  <span className="score-label">Good<span className="shortcut-hint"> (➡️ right)</span></span>
                </button>
                <button className="btn-score btn-easy" onClick={() => handleScore(5)}>
                  <strong>Easy</strong>
                  <span className="score-label">Easy<span className="shortcut-hint"> (⬆️ up)</span></span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
