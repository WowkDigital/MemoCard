import { useState } from 'react';
import { Plus, FolderPlus, LogOut, BookOpen, Settings, X, Layers } from 'lucide-react';
import type { Deck } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';

interface DashboardScreenProps {
  decks: Deck[];
  loadingDecks: boolean;
  onAddDeck: (name: string, description: string) => Promise<void>;
  onImportDeck: (name: string, description: string, cardsList: { front: string; back: string }[]) => Promise<void>;
  onSelectDeck: (deck: Deck) => void;
  onStartReview: (deck: Deck) => void;
  user: User;
  onLogout: () => void;
}

export function DashboardScreen({
  decks,
  loadingDecks,
  onAddDeck,
  onImportDeck,
  onSelectDeck,
  onStartReview,
  user,
  onLogout
}: DashboardScreenProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stan importu JSON
  const [showImportModal, setShowImportModal] = useState(false);
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importJSON, setImportJSON] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onAddDeck(newDeckName.trim(), newDeckDesc.trim());
      setNewDeckName('');
      setNewDeckDesc('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    
    if (!importJSON.trim()) {
      setImportError('Wklej kod JSON.');
      return;
    }

    setIsImporting(true);
    try {
      const parsed = JSON.parse(importJSON.trim());
      
      let finalName = importName.trim();
      let finalDesc = importDesc.trim();
      let cardsList: { front: string; back: string }[] = [];

      // Sprawdzenie struktury JSON (czy cały obiekt talii, czy tablica)
      if (Array.isArray(parsed)) {
        cardsList = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (parsed.name) finalName = parsed.name;
        if (parsed.description) finalDesc = parsed.description;
        if (Array.isArray(parsed.cards)) {
          cardsList = parsed.cards;
        } else {
          throw new Error('Obiekt JSON musi zawierać tablicę "cards".');
        }
      } else {
        throw new Error('JSON musi być tablicą fiszek lub obiektem talii.');
      }

      // Walidacja kart
      if (cardsList.length === 0) {
        throw new Error('Brak fiszek do zaimportowania.');
      }

      cardsList.forEach((card, index) => {
        if (typeof card !== 'object' || !card.front || !card.back) {
          throw new Error(`Karta na indeksie ${index} nie posiada wymaganych pól "front" i "back".`);
        }
      });

      if (!finalName) {
        throw new Error('Musisz podać nazwę talii.');
      }

      await onImportDeck(finalName, finalDesc, cardsList);
      setImportJSON('');
      setImportName('');
      setImportDesc('');
      setShowImportModal(false);
    } catch (err: any) {
      console.error(err);
      setImportError(err.message || 'Niepoprawny format JSON.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <Layers size={24} style={{ color: 'var(--primary)' }} />
          <span>MemoCard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {user.isAnonymous ? 'Konto tymczasowe' : user.email}
          </span>
          <button className="logout-btn" onClick={onLogout} title="Wyloguj się">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        <div className="section-title">
          <h2>Twoje Talie</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem' }}
              onClick={() => setShowImportModal(true)}
            >
              Importuj z JSON
            </button>
            <button 
              className="btn btn-primary" 
              style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem' }}
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              Nowa Talia
            </button>
          </div>
        </div>

        {loadingDecks ? (
          <div className="loading-spinner"></div>
        ) : decks.length === 0 ? (
          <div className="empty-state glass">
            <FolderPlus size={48} className="empty-icon" />
            <p className="empty-text">Nie masz jeszcze żadnych talii fiszek.</p>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowAddModal(true)}>
              Stwórz pierwszą talię
            </button>
          </div>
        ) : (
          <div className="deck-list">
            {decks.map((deck) => (
              <div key={deck.id} className="deck-card glass">
                <div className="deck-info">
                  <span className="deck-name">{deck.name}</span>
                  {deck.description && <span className="deck-desc">{deck.description}</span>}
                </div>
                <div className="deck-meta">
                  <span className="card-badge">{deck.cardCount} kart</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '8px 12px', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => onSelectDeck(deck)}
                      title="Zarządzaj kartami"
                    >
                      <Settings size={14} />
                      <span className="mobile-hide">Edytuj</span>
                    </button>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '8px 12px', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => onStartReview(deck)}
                      disabled={deck.cardCount === 0}
                      title={deck.cardCount === 0 ? "Brak kart do nauki" : "Rozpocznij naukę"}
                    >
                      <BookOpen size={14} />
                      <span>Ucz się</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Deck Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content glass animate-fade-in">
            <div className="modal-header">
              <h3 className="modal-title">Nowa Talia Fiszek</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nazwa talii</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="np. Słówka angielskie C1" 
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  required
                  maxLength={50}
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Opis (opcjonalnie)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="np. Zwroty z rozdziału 4" 
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
                  Anuluj
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: 'auto' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Tworzenie...' : 'Stwórz'}
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
              <h3 className="modal-title">Importuj talię z JSON</h3>
              <button className="close-btn" onClick={() => setShowImportModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleImportSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nazwa talii</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Wpisz jeśli brak w JSON" 
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    maxLength={50}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Opis talii</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Wpisz jeśli brak w JSON" 
                    value={importDesc}
                    onChange={(e) => setImportDesc(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Wklej JSON</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                  placeholder='Wklej tablicę kart lub obiekt talii...'
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
                <span className="form-label" style={{ marginBottom: '4px' }}>Dozwolone schematy JSON:</span>
                <pre style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-secondary)' }}>
{`// Opcja 1: Pełna talia z kartami
{
  "name": "Hiszpański",
  "description": "Fiszki",
  "cards": [
    { "front": "Hola", "back": "Cześć" }
  ]
}

// Opcja 2: Sama tablica fiszek
[
  { "front": "Hola", "back": "Cześć" }
]`}
                </pre>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: 'auto' }}
                  onClick={() => setShowImportModal(false)}
                >
                  Anuluj
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: 'auto' }}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importowanie...' : 'Importuj'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
