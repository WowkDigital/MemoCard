import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  Timestamp,
  increment,
  writeBatch,
  collectionGroup,
  getDoc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Pamięć podręczna w pamięci aplikacji do przechowywania znaczników czasu ostatniej synchronizacji z serwerem.
// Zapobiega to nadmiarowym zapytaniom do serwera podczas nawigacji między ekranami (np. powrót do Dashboardu).
const serverSyncCache: Record<string, number> = {};
const CACHE_EXPIRATION_MS = 2 * 60 * 1000; // 2 minuty


export interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: Timestamp | null;
  cardCount: number;
  ownerId?: string;
  isShared?: boolean;
}

export interface Card {
  id: string;
  front: string;
  back: string;
  createdAt: Timestamp | null;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: Timestamp;
}

export function useFirestore(userId: string | undefined) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  // 1. Observe all decks (own and shared in testing phase) in real-time
  useEffect(() => {
    if (!userId) {
      setDecks([]);
      setLoadingDecks(false);
      return;
    }

    // We use collectionGroup to fetch decks of all users
    const decksRef = collectionGroup(db, 'decks');

    const unsubscribe = onSnapshot(decksRef, (snapshot) => {
      const allDecks = snapshot.docs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const ownerId = pathParts[1];
        return {
          id: doc.id,
          ownerId,
          isShared: ownerId !== userId,
          ...doc.data()
        };
      }) as Deck[];

      // Filter duplicates: if the user has already cloned a deck (their own document with the same ID),
      // we do not show the original shared version.
      // Also, ensure each shared deck ID is only displayed once in the list.
      const myDeckIds = new Set(allDecks.filter(d => d.ownerId === userId).map(d => d.id));
      const seenSharedIds = new Set<string>();
      
      const filteredDecks = allDecks.filter(deck => {
        if (deck.ownerId === userId) return true;
        // Show shared deck only when guest/user does not have its copy with the same ID yet
        if (myDeckIds.has(deck.id)) return false;
        // Show only one copy of each shared deck ID
        if (seenSharedIds.has(deck.id)) return false;
        seenSharedIds.add(deck.id);
        return true;
      });

      // Sorting: own first, then shared
      filteredDecks.sort((a, b) => {
        if (a.isShared && !b.isShared) return 1;
        if (!a.isShared && b.isShared) return -1;
        return 0;
      });

      setDecks(filteredDecks);
      setLoadingDecks(false);
    }, (error) => {
      console.error("Error fetching decks:", error);
      setLoadingDecks(false);
    });

    return unsubscribe;
  }, [userId]);

  // 2. Add new deck
  const addDeck = async (name: string, description: string) => {
    if (!userId) return;
    try {
      const decksRef = collection(db, 'users', userId, 'decks');
      await addDoc(decksRef, {
        name,
        description,
        createdAt: serverTimestamp(),
        cardCount: 0
      });
    } catch (error) {
      console.error("Error adding deck:", error);
      throw error;
    }
  };

  // 3. Delete deck
  const deleteDeck = async (deckId: string) => {
    if (!userId) return;
    try {
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await deleteDoc(deckDocRef);
    } catch (error) {
      console.error("Error deleting deck:", error);
      throw error;
    }
  };

  // 4. Add new card to deck
  const addCard = async (deckId: string, front: string, back: string) => {
    if (!userId) return;
    try {
      // Inwalidacja pamięci podręcznej synchronizacji dla tej talii
      delete serverSyncCache[deckId];

      const cardsRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
      const now = new Date();
      
      // Add new card with default SRS parameters
      await addDoc(cardsRef, {
        front,
        back,
        createdAt: serverTimestamp(),
        interval: 0, // Ready for immediate review
        easeFactor: 2.5,
        repetitions: 0,
        nextReview: Timestamp.fromDate(now) // Set to now
      });

      // Increment card count in the deck
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        cardCount: increment(1)
      });
    } catch (error) {
      console.error("Error adding card:", error);
      throw error;
    }
  };

  // 5. Delete card from deck
  const deleteCard = async (deckId: string, cardId: string) => {
    if (!userId) return;
    try {
      // Inwalidacja pamięci podręcznej synchronizacji dla tej talii
      delete serverSyncCache[deckId];

      const cardDocRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
      await deleteDoc(cardDocRef);

      // Decrement card count in the deck
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        cardCount: increment(-1)
      });
    } catch (error) {
      console.error("Error deleting card:", error);
      throw error;
    }
  };

  // 6. Subscribe to all cards from a given deck
  const subscribeToCards = (deckId: string, callback: (cards: Card[]) => void) => {
    if (!userId) return () => {};
    const cardsRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
    const q = query(cardsRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const cardsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Card[];
      callback(cardsList);
    }, (error) => {
      console.error("Error fetching cards:", error);
    });
  };

  // 6b. Pobieranie kart talii z priorytetem cache-first oraz synchronizacją w tle
  const getCardsOnce = async (deckId: string, callback?: (cards: Card[]) => void) => {
    if (!userId) return [];
    const cardsRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
    const q = query(cardsRef, orderBy('createdAt', 'desc'));

    let cachedCards: Card[] = [];
    let hasCache = false;

    // 1. Próba natychmiastowego odczytu z lokalnej pamięci podręcznej (IndexedDB)
    try {
      const cacheSnapshot = await getDocsFromCache(q);
      if (!cacheSnapshot.empty) {
        cachedCards = cacheSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Card[];
        hasCache = true;
        if (callback) {
          callback(cachedCards);
        }
      }
    } catch (err) {
      console.warn("Brak danych w cache lub błąd (pobieranie z serwera):", err);
    }

    // 2. Sprawdzenie, czy cache dla tej talii nie wygasł (zapobieganie nadmiarowym zapytaniom sieciowym)
    const now = Date.now();
    const lastSync = serverSyncCache[deckId] || 0;
    const isCacheStale = now - lastSync > CACHE_EXPIRATION_MS;

    if (!isCacheStale && hasCache) {
      // Pamięć podręczna jest świeża, zwracamy bez odpytywania serwera
      return cachedCards;
    }

    // 3. Pobranie najnowszych danych z serwera w tle w celu synchronizacji cache i stanu UI
    try {
      const serverSnapshot = await getDocsFromServer(q);
      const serverCards = serverSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Card[];
      
      // Zapisanie czasu udanej synchronizacji sieciowej
      serverSyncCache[deckId] = Date.now();

      // Wywołujemy callback tylko jeśli dane z serwera różnią się od cache (redukcja renderów Reacta)
      const cachedIds = JSON.stringify(cachedCards.map(c => c.id + c.repetitions + c.interval + (c.nextReview?.seconds || 0)));
      const serverIds = JSON.stringify(serverCards.map(c => c.id + c.repetitions + c.interval + (c.nextReview?.seconds || 0)));

      if ((!hasCache || cachedIds !== serverIds) && callback) {
        callback(serverCards);
      }
      return serverCards;
    } catch (err) {
      console.error("Błąd synchronizacji z serwerem Firestore (tryb offline):", err);
      // W razie błędu sieci (np. offline) zwracamy dane z cache
      return cachedCards;
    }
  };

  // 7. Update SRS parameters after scoring a card (SuperMemo-2 SM-2)
  // quality: 1 (Again), 3 (Hard), 4 (Good), 5 (Easy)
  const scoreCard = async (deckId: string, cardId: string, currentCard: Card, quality: number) => {
    if (!userId) return;
    try {
      // Inwalidacja pamięci podręcznej synchronizacji dla tej talii
      delete serverSyncCache[deckId];

      let nextRepetitions = currentCard.repetitions;
      let nextInterval = currentCard.interval;
      let nextEaseFactor = currentCard.easeFactor;

      if (quality < 4) {
        // Again or Hard with a low score resets repetitions
        nextRepetitions = 0;
        nextInterval = 1; // Repeat tomorrow
      } else {
        // Correct answer (Good or Easy)
        if (nextRepetitions === 0) {
          nextInterval = 1;
        } else if (nextRepetitions === 1) {
          nextInterval = 6;
        } else {
          nextInterval = Math.round(nextInterval * nextEaseFactor);
        }
        nextRepetitions += 1;
      }

      // Update easeFactor
      nextEaseFactor = nextEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (nextEaseFactor < 1.3) {
        nextEaseFactor = 1.3;
      }

      // Calculate next review date
      const now = new Date();
      const nextReviewDate = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000);
      
      const cardDocRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
      await updateDoc(cardDocRef, {
        repetitions: nextRepetitions,
        interval: nextInterval,
        easeFactor: Number(nextEaseFactor.toFixed(2)),
        nextReview: Timestamp.fromDate(nextReviewDate)
      });
    } catch (error) {
      console.error("Error scoring card:", error);
      throw error;
    }
  };

  // Import entire deck with cards
  const importDeck = async (name: string, description: string, cardsList: { front: string; back: string }[]) => {
    if (!userId) return;
    try {
      const deckDocRef = doc(collection(db, 'users', userId, 'decks'));
      const now = new Date();
      const chunkSize = 400;

      // 1. Utworzenie pierwszego wsadu z dokumentem talii oraz pierwszym pakietem kart
      const firstBatch = writeBatch(db);
      firstBatch.set(deckDocRef, {
        name,
        description,
        createdAt: serverTimestamp(),
        cardCount: cardsList.length
      });

      const firstChunk = cardsList.slice(0, chunkSize);
      firstChunk.forEach((card) => {
        const cardRef = doc(collection(db, 'users', userId, 'decks', deckDocRef.id, 'cards'));
        firstBatch.set(cardRef, {
          front: card.front,
          back: card.back,
          createdAt: serverTimestamp(),
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReview: Timestamp.fromDate(now)
        });
      });
      await firstBatch.commit();

      // 2. Utworzenie i wgranie kolejnych pakietów kart w pętli (zabezpieczenie przed limitem 500 operacji Firestore)
      for (let i = chunkSize; i < cardsList.length; i += chunkSize) {
        const chunk = cardsList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((card) => {
          const cardRef = doc(collection(db, 'users', userId, 'decks', deckDocRef.id, 'cards'));
          batch.set(cardRef, {
            front: card.front,
            back: card.back,
            createdAt: serverTimestamp(),
            interval: 0,
            easeFactor: 2.5,
            repetitions: 0,
            nextReview: Timestamp.fromDate(now)
          });
        });
        await batch.commit();
      }

      // 3. Inwalidacja pamięci podręcznej dla nowo wgranej talii
      delete serverSyncCache[deckDocRef.id];
    } catch (error) {
      console.error("Error importing deck:", error);
      throw error;
    }
  };

  // Import cards to an existing deck
  const importCards = async (deckId: string, cardsList: { front: string; back: string }[]) => {
    if (!userId) return;
    try {
      // Inwalidacja pamięci podręcznej synchronizacji dla tej talii
      delete serverSyncCache[deckId];

      const now = new Date();
      const chunkSize = 400;

      // 1. Zapis kart w pakietach po 400 sztuk (zabezpieczenie przed limitem 500 operacji Firestore)
      for (let i = 0; i < cardsList.length; i += chunkSize) {
        const chunk = cardsList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((card) => {
          const cardRef = doc(collection(db, 'users', userId, 'decks', deckId, 'cards'));
          batch.set(cardRef, {
            front: card.front,
            back: card.back,
            createdAt: serverTimestamp(),
            interval: 0,
            easeFactor: 2.5,
            repetitions: 0,
            nextReview: Timestamp.fromDate(now)
          });
        });
        await batch.commit();
      }

      // 2. Aktualizacja liczby kart w dokumencie talii
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        cardCount: increment(cardsList.length)
      });

      // 3. Ponowne wyczyszczenie cache po zakończeniu zapisu
      delete serverSyncCache[deckId];
    } catch (error) {
      console.error("Error importing cards:", error);
      throw error;
    }
  };

  // Clone shared deck and its cards to log in user account
  const cloneSharedDeck = async (sharedOwnerId: string, sharedDeckId: string) => {
    if (!userId) return;
    try {
      // 1. Pobranie danych oryginalnej talii
      const sharedDeckDoc = await getDoc(doc(db, 'users', sharedOwnerId, 'decks', sharedDeckId));
      if (!sharedDeckDoc.exists()) return;
      const deckData = sharedDeckDoc.data();

      // 2. Pobranie wszystkich kart z oryginalnej talii
      const cardsSnapshot = await getDocs(collection(db, 'users', sharedOwnerId, 'decks', sharedDeckId, 'cards'));
      const cardsList = cardsSnapshot.docs.map(doc => doc.data());
      
      const newDeckRef = doc(db, 'users', userId, 'decks', sharedDeckId);
      const now = new Date();
      const chunkSize = 400;

      // 3. Pierwszy wsad z nowym dokumentem talii oraz pierwszym pakietem kart
      const firstBatch = writeBatch(db);
      firstBatch.set(newDeckRef, {
        name: deckData.name,
        description: deckData.description || '',
        createdAt: serverTimestamp(),
        cardCount: cardsList.length
      });

      const firstChunk = cardsList.slice(0, chunkSize);
      firstChunk.forEach((cardData) => {
        const newCardRef = doc(collection(db, 'users', userId, 'decks', sharedDeckId, 'cards'));
        firstBatch.set(newCardRef, {
          front: cardData.front,
          back: cardData.back,
          createdAt: serverTimestamp(),
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          nextReview: Timestamp.fromDate(now)
        });
      });
      await firstBatch.commit();

      // 4. Skopiowanie pozostałych kart w pakietach po 400
      for (let i = chunkSize; i < cardsList.length; i += chunkSize) {
        const chunk = cardsList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((cardData) => {
          const newCardRef = doc(collection(db, 'users', userId, 'decks', sharedDeckId, 'cards'));
          batch.set(newCardRef, {
            front: cardData.front,
            back: cardData.back,
            createdAt: serverTimestamp(),
            interval: 0,
            easeFactor: 2.5,
            repetitions: 0,
            nextReview: Timestamp.fromDate(now)
          });
        });
        await batch.commit();
      }

      // 5. Inwalidacja pamięci podręcznej synchronizacji
      delete serverSyncCache[sharedDeckId];
    } catch (error) {
      console.error("Error cloning deck:", error);
      throw error;
    }
  };

  return {
    decks,
    loadingDecks,
    addDeck,
    deleteDeck,
    addCard,
    deleteCard,
    subscribeToCards,
    getCardsOnce,
    scoreCard,
    importDeck,
    importCards,
    cloneSharedDeck
  };
}
