import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import type { Deck } from './hooks/useFirestore';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { DeckManageScreen } from './components/DeckManageScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { AddDeckScreen } from './components/AddDeckScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { Toast } from './components/Toast';

type Screen = 'DASHBOARD' | 'DECK_MANAGE' | 'REVIEW' | 'ADD_DECK' | 'SETTINGS';

function App() {
  const { user, loading: authLoading, error: authError, loginWithGoogle, loginAnonymously, logout } = useAuth();

  const [screen, setScreen] = useState<Screen>('DASHBOARD');
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
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
          user={user} 
          onLogout={logout} 
          onSelectDeck={(deck) => {
            setSelectedDeck(deck);
            setScreen('DECK_MANAGE');
          }} 
          onStartReview={(deck) => {
            setSelectedDeck(deck);
            setScreen('REVIEW');
          }} 
          onNavigateToAddDeck={() => {
            setScreen('ADD_DECK');
          }}
          onNavigateToSettings={() => {
            setScreen('SETTINGS');
          }}
          showToast={showToast}
        />
      )}

      {screen === 'DECK_MANAGE' && selectedDeck && (
        <DeckManageScreen 
          user={user}
          deck={selectedDeck} 
          onBack={() => {
            setScreen('DASHBOARD');
            setSelectedDeck(null);
          }} 
          onDeleteDeckSuccess={() => {
            showToast('Deck has been deleted.', 'success');
            setScreen('DASHBOARD');
            setSelectedDeck(null);
          }}
          showToast={showToast}
        />
      )}

      {screen === 'REVIEW' && selectedDeck && (
        <ReviewScreen 
          user={user}
          deck={selectedDeck} 
          onBack={() => {
            setScreen('DASHBOARD');
            setSelectedDeck(null);
          }} 
        />
      )}

      {screen === 'ADD_DECK' && (
        <AddDeckScreen 
          user={user}
          onBack={() => {
            setScreen('DASHBOARD');
          }}
          showToast={showToast}
        />
      )}

      {screen === 'SETTINGS' && (
        <SettingsScreen 
          onBack={() => {
            setScreen('DASHBOARD');
          }}
          showToast={showToast}
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
