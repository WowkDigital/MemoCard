import { useState } from 'react';
import { Plus, FolderPlus, LogOut, BookOpen, Settings, X, Layers } from 'lucide-react';
import type { Deck } from '../hooks/useFirestore';
import type { User } from 'firebase/auth';

interface DashboardScreenProps {
  decks: Deck[];
  loadingDecks: boolean;
  onAddDeck: (name: string, description: string) => Promise<void>;
  onSelectDeck: (deck: Deck) => void;
  onStartReview: (deck: Deck) => void;
  user: User;
  onLogout: () => void;
}

export function DashboardScreen({
  decks,
  loadingDecks,
  onAddDeck,
  onSelectDeck,
  onStartReview,
  user,
  onLogout
}: DashboardScreenProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <button 
            className="btn btn-primary" 
            style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem' }}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} />
            Nowa Talia
          </button>
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
    </div>
  );
}
