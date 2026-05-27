import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Plus, AlertCircle, Layers } from 'lucide-react';
import type { Deck, Card } from '../hooks/useFirestore';
import { parseImportData } from '../utils/importParser';

interface DeckManageScreenProps {
  deck: Deck;
  onBack: () => void;
  onAddCard: (front: string, back: string) => Promise<void>;
  onImportCards: (cardsList: { front: string; back: string }[]) => Promise<void>;
  onDeleteCard: (cardId: string) => Promise<void>;
  onDeleteDeck: () => Promise<void>;
  subscribeToCards: (deckId: string, callback: (cards: Card[]) => void) => () => void;
}

export function DeckManageScreen({
  deck,
  onBack,
  onAddCard,
  onImportCards,
  onDeleteCard,
  onDeleteDeck,
  subscribeToCards
}: DeckManageScreenProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showConfirmDeleteDeck, setShowConfirmDeleteDeck] = useState(false);

  // Stan importu JSON
  const [showImportMode, setShowImportMode] = useState(false);
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Zapis do subskrypcji kart
  useEffect(() => {
    const unsubscribe = subscribeToCards(deck.id, (loadedCards) => {
      setCards(loadedCards);
      setLoadingCards(false);
    });
    return unsubscribe;
  }, [deck.id, subscribeToCards]);

  const handleAddCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    setIsAdding(true);
    try {
      await onAddCard(front.trim(), back.trim());
      setFront('');
      setBack('');
    } catch (err) {
      console.error(err);
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
      const parsedCards = parseImportData(text);
      await onImportCards(parsedCards);
      setImportJSON('');
      setShowImportMode(false);
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Niepoprawny format danych.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container">
      {/* Navigation */}
      <div className="navigation-bar">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Powrót do pulpitów</span>
        </button>
      </div>

      {/* Deck Header */}
      <header className="app-header" style={{ marginBottom: '16px', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={22} style={{ color: 'var(--primary)' }} />
            {deck.name}
          </h1>
          {deck.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{deck.description}</p>
          )}
        </div>
      </header>

      {/* Add Card Form */}
      <div className="glass" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>
            {showImportMode ? 'Importuj fiszki z JSON' : 'Dodaj nową fiszkę'}
          </h3>
          <button 
            className="btn btn-secondary" 
            style={{ width: 'auto', padding: '4px 12px', fontSize: '0.8rem' }}
            onClick={() => {
              setShowImportMode(!showImportMode);
              setImportError(null);
            }}
          >
            {showImportMode ? 'Ręczne dodawanie' : 'Importuj z JSON'}
          </button>
        </div>

        {!showImportMode ? (
          <form onSubmit={handleAddCardSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Awers (front)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="np. Hello" 
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Rewers (back)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="np. Cześć" 
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
              {isAdding ? 'Dodawanie...' : 'Dodaj Fiszkę'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleImportSubmit}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Wklej dane (JSON, CSV, Excel)</label>
              <textarea 
                className="form-input" 
                style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                placeholder="Wklej tablicę JSON, dane CSV (rozdzielane ;) lub skopiowane kolumny z Excela..."
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
              <span className="form-label" style={{ fontSize: '0.8rem', marginBottom: '4px' }}>Przykłady wydajnych formatów:</span>
              <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`// 1. Zwykły tekst / Excel / CSV (Zalecane — najszybsze)
Hello;Cześć
Goodbye;Do widzenia

// 2. Kompaktowy JSON (bez powtarzania kluczy)
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
              {isImporting ? 'Importowanie...' : 'Rozpocznij import'}
            </button>
          </form>
        )}
      </div>

      {/* Cards List Section */}
      <div className="section-title">
        <h2>Zawartość Talii ({cards.length} kart)</h2>
      </div>

      {loadingCards ? (
        <div className="loading-spinner"></div>
      ) : cards.length === 0 ? (
        <div className="empty-state glass">
          <AlertCircle size={40} className="empty-icon" />
          <p className="empty-text">Talia jest pusta. Dodaj fiszki powyżej, aby rozpocząć.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
          {cards.map((card) => (
            <div key={card.id} className="card-item glass">
              <div className="card-item-content">
                <span className="card-item-front">{card.front}</span>
                <span className="card-item-back">{card.back}</span>
                <span className="card-item-meta">
                  Powtórki: {card.repetitions} | Łatwość: {card.easeFactor} | Odstęp: {card.interval}d
                </span>
              </div>
              <button 
                className="delete-icon-btn" 
                onClick={() => onDeleteCard(card.id)}
                title="Usuń fiszkę"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Danger Zone: Delete Deck */}
      <div className="glass" style={{ padding: '20px', border: '1px dashed rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.02)' }}>
        <h3 style={{ color: 'var(--color-again)', marginBottom: '12px', fontSize: '1.1rem' }}>Strefa Niebezpieczna</h3>
        {!showConfirmDeleteDeck ? (
          <button 
            className="btn btn-danger" 
            style={{ width: 'auto' }}
            onClick={() => setShowConfirmDeleteDeck(true)}
          >
            <Trash2 size={16} />
            Usuń talię i wszystkie karty
          </button>
        ) : (
          <div>
            <p style={{ fontSize: '0.9rem', marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Czy na pewno chcesz bezpowrotnie usunąć tę talię oraz wszystkie jej fiszki?
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ width: 'auto' }}
                onClick={() => setShowConfirmDeleteDeck(false)}
              >
                Anuluj
              </button>
              <button 
                className="btn btn-danger" 
                style={{ width: 'auto' }}
                onClick={onDeleteDeck}
              >
                Tak, usuń talię
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
