import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useFirestore } from './hooks/useFirestore';
import type { Deck } from './hooks/useFirestore';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { DeckManageScreen } from './components/DeckManageScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { Toast } from './components/Toast';

type Screen = 'DASHBOARD' | 'DECK_MANAGE' | 'REVIEW';

function App() {
  const { user, loading: authLoading, error: authError, loginWithGoogle, loginAnonymously, logout } = useAuth();
  const { 
    decks, 
    loadingDecks, 
    addDeck, 
    deleteDeck, 
    addCard, 
    deleteCard, 
    subscribeToCards, 
    scoreCard,
    importDeck,
    importCards,
    cloneSharedDeck
  } = useFirestore(user?.uid);

  const [screen, setScreen] = useState<Screen>('DASHBOARD');
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);

  const handleSelectDeck = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      showToast('Cloning shared deck...', 'success');
      try {
        await cloneSharedDeck(deck.ownerId, deck.id);
        const clonedDeck = { ...deck, isShared: false, ownerId: user?.uid };
        setSelectedDeck(clonedDeck);
        setScreen('DECK_MANAGE');
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck.', 'error');
      }
    } else {
      setSelectedDeck(deck);
      setScreen('DECK_MANAGE');
    }
  };

  const handleStartReview = async (deck: Deck) => {
    if (deck.isShared && deck.ownerId) {
      showToast('Preparing shared deck...', 'success');
      try {
        await cloneSharedDeck(deck.ownerId, deck.id);
        const clonedDeck = { ...deck, isShared: false, ownerId: user?.uid };
        setSelectedDeck(clonedDeck);
        setScreen('REVIEW');
      } catch (err) {
        console.error(err);
        showToast('Failed to clone deck for studying.', 'error');
      }
    } else {
      setSelectedDeck(deck);
      setScreen('REVIEW');
    }
  };
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleAddDeck = async (name: string, description: string) => {
    try {
      await addDeck(name, description);
      showToast('New deck created!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to create deck.', 'error');
    }
  };

  const handleImportDeck = async (name: string, description: string, cardsList: { front: string; back: string }[]) => {
    try {
      await importDeck(name, description, cardsList);
      showToast('New deck with flashcards imported!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to import deck.', 'error');
      throw err;
    }
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck) return;
    try {
      await deleteDeck(selectedDeck.id);
      showToast('Deck has been deleted.', 'success');
      setScreen('DASHBOARD');
      setSelectedDeck(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to delete deck.', 'error');
    }
  };

  const handleAddCard = async (front: string, back: string) => {
    if (!selectedDeck) return;
    try {
      await addCard(selectedDeck.id, front, back);
      showToast('New flashcard added!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to add flashcard.', 'error');
    }
  };

  const handleImportCards = async (cardsList: { front: string; back: string }[]) => {
    if (!selectedDeck) return;
    try {
      await importCards(selectedDeck.id, cardsList);
      showToast(`Imported ${cardsList.length} flashcards!`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to import flashcards.', 'error');
      throw err;
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!selectedDeck) return;
    try {
      await deleteCard(selectedDeck.id, cardId);
      showToast('Flashcard has been deleted.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete flashcard.', 'error');
    }
  };

  // Auth loading state on initial load
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // Force login screen if user is not authenticated
  if (!user) {
    return (
      <LoginScreen 
        onLoginGoogle={loginWithGoogle} 
        onLoginAnonymous={loginAnonymously} 
        loading={authLoading} 
        error={authError} 
      />
    );
  }

  return (
    <>
      {screen === 'DASHBOARD' && (
        <DashboardScreen 
          decks={decks} 
          loadingDecks={loadingDecks} 
          onAddDeck={handleAddDeck} 
          onImportDeck={handleImportDeck}
          onSelectDeck={handleSelectDeck} 
          onStartReview={handleStartReview} 
          user={user} 
          onLogout={logout} 
        />
      )}

      {screen === 'DECK_MANAGE' && selectedDeck && (
        <DeckManageScreen 
          deck={selectedDeck} 
          onBack={() => {
            setScreen('DASHBOARD');
            setSelectedDeck(null);
          }} 
          onAddCard={handleAddCard} 
          onImportCards={handleImportCards}
          onDeleteCard={handleDeleteCard} 
          onDeleteDeck={handleDeleteDeck} 
          subscribeToCards={subscribeToCards} 
        />
      )}

      {screen === 'REVIEW' && selectedDeck && (
        <ReviewScreen 
          deck={selectedDeck} 
          onBack={() => {
            setScreen('DASHBOARD');
            setSelectedDeck(null);
          }} 
          scoreCard={scoreCard} 
          subscribeToCards={subscribeToCards} 
        />
      )}

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </>
  );
}

export default App;
