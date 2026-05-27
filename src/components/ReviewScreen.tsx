import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, RefreshCw, Eye, Sparkles } from 'lucide-react';
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
  
  // Kolejka kart w bieżącej sesji nauki
  const [sessionQueue, setSessionQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Gesty dotykowe na telefonach
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const dragOccurred = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Gesty aktywne tylko gdy karta jest odwrócona (pokazuje odpowiedź)
    if (!isFlipped) return;
    
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
    const threshold = 100; // minimalne przesunięcie w pikselach (zwiększona odporność na fałszywe przesunięcia)

    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Swipe poziomy
      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          handleScore(4); // W prawo -> Dobrze (4)
        } else {
          handleScore(1); // W lewo -> Znowu (1)
        }
        resetSwipeState();
        return;
      }
    } else {
      // Swipe pionowy
      if (Math.abs(diffY) > threshold) {
        if (diffY > 0) {
          handleScore(3); // W dół -> Trudno (3)
        } else {
          handleScore(5); // W górę -> Łatwo (5)
        }
        resetSwipeState();
        return;
      }
    }

    resetSwipeState();
  };

  const resetSwipeState = () => {
    setTouchStart(null);
    setTouchCurrent(null);
    setIsSwiping(false);
  };

  const handleCardClick = () => {
    if (dragOccurred.current) {
      return; // Zablokuj obrót, jeśli intencją było przesunięcie
    }
    setIsFlipped(!isFlipped);
  };

  const getCardStyle = () => {
    if (!touchStart || !touchCurrent || !isSwiping) {
      return {
        transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      };
    }

    const diffX = touchCurrent.x - touchStart.x;
    const diffY = touchCurrent.y - touchStart.y;
    const rotate = diffX * 0.08; // Delikatna rotacja przy przesuwaniu

    return {
      transform: `translate3d(${diffX}px, ${diffY}px, 0) rotate(${rotate}deg)`,
      transition: 'none',
      cursor: 'grabbing',
      touchAction: 'none' // Zapobiega przewijaniu strony na telefonach podczas gestu
    };
  };

  const getOverlayLabel = () => {
    if (!touchStart || !touchCurrent || !isSwiping) return null;

    const diffX = touchCurrent.x - touchStart.x;
    const diffY = touchCurrent.y - touchStart.y;
    const threshold = 30; // Próg od którego wyświetlamy etykietę gestu

    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (Math.abs(diffX) > threshold) {
        return diffX > 0
          ? { text: 'Dobrze', color: '#10b981' } // Zielony
          : { text: 'Znowu', color: '#ef4444' }; // Czerwony
      }
    } else {
      if (Math.abs(diffY) > threshold) {
        return diffY > 0
          ? { text: 'Trudno', color: '#f59e0b' } // Pomarańczowy
          : { text: 'Łatwo', color: '#3b82f6' }; // Niebieski
      }
    }
    return null;
  };

  const overlay = getOverlayLabel();

  // Pobranie i filtrowanie kart do powtórki
  useEffect(() => {
    const unsubscribe = subscribeToCards(deck.id, (loadedCards) => {
      
      // Filtrujemy tylko karty, których termin powtórki minął lub jest dzisiaj
      const now = new Date();
      const due = loadedCards.filter(card => {
        if (!card.nextReview) return true;
        // Konwersja Firestore Timestamp na JS Date
        const reviewDate = card.nextReview.toDate();
        return reviewDate <= now;
      });

      // Tasowanie kart (dla lepszego efektu nauki)
      const shuffledDue = [...due].sort(() => Math.random() - 0.5);

      // Inicjalizujemy kolejkę tylko przy pierwszym ładowaniu
      if (loading) {
        setSessionQueue(shuffledDue);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [deck.id, subscribeToCards, loading]);

  const currentCard = sessionQueue[currentIndex];

  const handleScore = async (quality: number) => {
    if (!currentCard) return;

    // Przekazanie oceny do bazy danych
    await scoreCard(deck.id, currentCard.id, currentCard, quality);

    // Obróć kartę z powrotem na front
    setIsFlipped(false);

    // Krótkie opóźnienie przed załadowaniem kolejnej, aby animacja obrotu zdążyła się zresetować
    setTimeout(() => {
      if (quality < 4) {
        // Jeśli zła ocena (Again / Hard) - dorzucamy kopię karty na koniec kolejki sesji
        setSessionQueue(prev => [...prev, currentCard]);
      } else {
        // Zwiększamy liczbę poprawnie zaliczonych w tej sesji
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

  // Stan zakończenia sesji
  const isFinished = !currentCard || currentIndex >= sessionQueue.length;

  return (
    <div className="container">
      {/* Navigation */}
      <div className="navigation-bar">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Zakończ sesję</span>
        </button>
      </div>

      {isFinished ? (
        <div className="empty-state glass animate-fade-in" style={{ padding: '48px 24px' }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', margin: '0 auto 24px' }}>
            <CheckCircle size={40} />
          </div>
          <h2 className="login-title" style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Świetna robota!</h2>
          <p className="login-subtitle" style={{ marginBottom: '24px' }}>
            Wszystkie zaplanowane powtórki dla talii <strong>{deck.name}</strong> zostały zakończone na dziś.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', width: '100%', maxWidth: '320px' }}>
            <button className="btn btn-secondary" onClick={onBack}>
              Wróć do talii
            </button>
            <button className="btn btn-primary" onClick={handleResetSession}>
              <RefreshCw size={16} />
              Ucz się ponownie
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Progress Indicator */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>Sesja powtórek: {completedCount} ukończonych</span>
            <span>Pozostało: {sessionQueue.length - currentIndex} fiszek</span>
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${(currentIndex / sessionQueue.length) * 100}%` }}
            ></div>
          </div>

          {/* Flashcard Component */}
          <div 
            className={`flashcard-container ${isFlipped ? 'is-flipped' : ''}`}
            style={getCardStyle()}
            onClick={handleCardClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {overlay && (
              <div 
                className="swipe-overlay-indicator"
                style={{ 
                  color: overlay.color, 
                  borderColor: overlay.color,
                  backgroundColor: `rgba(${
                    overlay.color === '#10b981' ? '16,185,129' : 
                    overlay.color === '#ef4444' ? '239,68,68' : 
                    overlay.color === '#f59e0b' ? '245,158,11' : 
                    '59,130,246'
                  }, 0.15)`
                }}
              >
                {overlay.text}
              </div>
            )}
            <div className="flashcard-inner">
              {/* Front Face */}
              <div className="flashcard-face flashcard-front">
                <span className="flashcard-side-label">Pytanie / Awers</span>
                <span className="flashcard-text">{currentCard.front}</span>
                <span className="flashcard-hint">
                  <Eye size={14} /> Kliknij kartę, aby zobaczyć odpowiedź
                </span>
              </div>
              
              {/* Back Face */}
              <div className="flashcard-face flashcard-back">
                <span className="flashcard-side-label">Odpowiedź / Rewers</span>
                <span className="flashcard-text">{currentCard.back}</span>
                <span className="flashcard-hint">
                  <Sparkles size={14} /> Wybierz poziom trudności poniżej
                </span>
              </div>
            </div>
          </div>

          {/* Action Grid */}
          {!isFlipped ? (
            <div className="review-actions-prompt">
              Kliknij fiszkę powyżej, aby zobaczyć drugą stronę.
            </div>
          ) : (
            <div className="animate-fade-in">
              <div style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Jak dobrze pamiętałeś tę fiszkę?
              </div>
              <div className="score-buttons-grid">
                <button className="btn-score btn-again" onClick={() => handleScore(1)}>
                  <strong>Znowu</strong>
                  <span className="score-label">Reset</span>
                </button>
                <button className="btn-score btn-hard" onClick={() => handleScore(3)}>
                  <strong>Trudno</strong>
                  <span className="score-label">Trudna</span>
                </button>
                <button className="btn-score btn-good" onClick={() => handleScore(4)}>
                  <strong>Dobrze</strong>
                  <span className="score-label">Średnia</span>
                </button>
                <button className="btn-score btn-easy" onClick={() => handleScore(5)}>
                  <strong>Łatwo</strong>
                  <span className="score-label">Szybka</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
