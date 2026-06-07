import { useState, useEffect, useCallback } from 'react';
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
  getDocsFromServer,
  where
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

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
  visibility?: 'private' | 'public' | 'guest';
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
  // 1. Observe own and shared decks in real-time
  useEffect(() => {
    if (!userId) {
      setDecks([]);
      setLoadingDecks(false);
      return;
    }

    const currentUser = auth.currentUser;
    const isOwner = currentUser && currentUser.email === 'wowk.digital@gmail.com';

    let ownDecks: Deck[] = [];
    let sharedDecks: Deck[] = [];

    const updateCombinedDecks = () => {
      const myDeckIds = new Set(ownDecks.map(d => d.id));
      const filteredShared = sharedDecks.filter(d => d.ownerId !== userId && !myDeckIds.has(d.id));

      const seenSharedIds = new Set<string>();
      const uniqueShared = filteredShared.filter(deck => {
        if (seenSharedIds.has(deck.id)) return false;
        seenSharedIds.add(deck.id);
        return true;
      });

      const combined = [...ownDecks, ...uniqueShared];

      combined.sort((a, b) => {
        if (a.isShared && !b.isShared) return 1;
        if (!a.isShared && b.isShared) return -1;
        return 0;
      });

      setDecks(combined);
      setLoadingDecks(false);
    };

    // Subscribe to own decks
    const ownDecksRef = collection(db, 'users', userId, 'decks');
    const unsubscribeOwn = onSnapshot(ownDecksRef, (snapshot) => {
      ownDecks = snapshot.docs.map(doc => ({
        id: doc.id,
        ownerId: userId,
        isShared: false,
        ...doc.data()
      })) as Deck[];
      updateCombinedDecks();
    }, (error) => {
      console.error("Error fetching own decks:", error);
      setLoadingDecks(false);
    });

    // Subscribe to shared/public/guest decks
    let sharedQuery;
    if (isOwner) {
      sharedQuery = collectionGroup(db, 'decks');
    } else if (currentUser?.isAnonymous) {
      sharedQuery = query(collectionGroup(db, 'decks'), where('visibility', '==', 'guest'));
    } else {
      sharedQuery = query(collectionGroup(db, 'decks'), where('visibility', 'in', ['public', 'guest']));
    }

    const unsubscribeShared = onSnapshot(sharedQuery, (snapshot) => {
      sharedDecks = snapshot.docs.map(doc => {
        const pathParts = doc.ref.path.split('/');
        const ownerId = pathParts[1];
        return {
          id: doc.id,
          ownerId,
          isShared: ownerId !== userId,
          ...doc.data()
        };
      }) as Deck[];
      updateCombinedDecks();
    }, (error) => {
      console.error("Error fetching shared decks:", error);
      updateCombinedDecks();
    });

    return () => {
      unsubscribeOwn();
      unsubscribeShared();
    };
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
        cardCount: 0,
        visibility: 'private'
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
  const getCardsOnce = useCallback(async (deckId: string, callback?: (cards: Card[]) => void) => {
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
  }, [userId]);

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

      if (quality === 6) {
        // Forever mode: set an extremely large interval and nextReview far in the future
        nextInterval = 999999;
        const nextReviewDate = new Date(9999, 11, 31);
        const cardDocRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
        await updateDoc(cardDocRef, {
          repetitions: nextRepetitions + 1,
          interval: nextInterval,
          easeFactor: nextEaseFactor,
          nextReview: Timestamp.fromDate(nextReviewDate)
        });
        return;
      }

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

  // Helper to run Firestore write batches in parallel with a concurrency limit
  const commitBatchesWithConcurrency = async (
    batches: any[],
    concurrencyLimit: number,
    onBatchComplete: (index: number) => void
  ) => {
    let index = 0;
    const workers = Array(Math.min(concurrencyLimit, batches.length))
      .fill(null)
      .map(async () => {
        while (index < batches.length) {
          const currentIndex = index++;
          await batches[currentIndex].commit();
          onBatchComplete(currentIndex);
        }
      });
    await Promise.all(workers);
  };

  // Import entire deck with cards
  const importDeck = async (
    name: string, 
    description: string, 
    cardsList: { front: string; back: string }[],
    onProgress?: (progress: number) => void
  ) => {
    if (!userId) return;
    try {
      const deckDocRef = doc(collection(db, 'users', userId, 'decks'));
      const now = new Date();
      const chunkSize = 400;

      const batches = [];
      
      // 1. Pierwszy wsad z dokumentem talii oraz pierwszym pakietem kart
      const firstBatch = writeBatch(db);
      firstBatch.set(deckDocRef, {
        name,
        description,
        createdAt: serverTimestamp(),
        cardCount: cardsList.length,
        visibility: 'private'
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
      batches.push(firstBatch);

      // 2. Przygotowanie kolejnych wsadów w pętli
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
        batches.push(batch);
      }

      // 3. Wgrywanie równoległe (max 5 jednocześnie) z raportowaniem postępu
      let processedCount = 0;
      await commitBatchesWithConcurrency(batches, 5, (index) => {
        let batchSize = 0;
        if (index === 0) {
          batchSize = firstChunk.length;
        } else {
          batchSize = Math.min(chunkSize, cardsList.length - chunkSize - (index - 1) * chunkSize);
        }
        processedCount += batchSize;
        if (onProgress) {
          onProgress(processedCount);
        }
      });

      // 4. Inwalidacja pamięci podręcznej dla nowo wgranej talii
      delete serverSyncCache[deckDocRef.id];
    } catch (error) {
      console.error("Error importing deck:", error);
      throw error;
    }
  };

  // Import cards to an existing deck
  const importCards = async (
    deckId: string, 
    cardsList: { front: string; back: string }[],
    onProgress?: (progress: number) => void
  ) => {
    if (!userId) return;
    try {
      // Inwalidacja pamięci podręcznej synchronizacji dla tej talii
      delete serverSyncCache[deckId];

      const now = new Date();
      const chunkSize = 400;

      const batches = [];
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
        batches.push(batch);
      }

      // 1. Zapis kart w pakietach równolegle (max 5 jednocześnie)
      let processedCount = 0;
      await commitBatchesWithConcurrency(batches, 5, (index) => {
        const batchSize = Math.min(chunkSize, cardsList.length - index * chunkSize);
        processedCount += batchSize;
        if (onProgress) {
          onProgress(processedCount);
        }
      });

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
  const cloneSharedDeck = async (
    sharedOwnerId: string, 
    sharedDeckId: string,
    onProgress?: (progress: number) => void
  ) => {
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

      const batches = [];

      // 3. Pierwszy wsad z nowym dokumentem talii oraz pierwszym pakietem kart
      const firstBatch = writeBatch(db);
      firstBatch.set(newDeckRef, {
        name: deckData.name,
        description: deckData.description || '',
        createdAt: serverTimestamp(),
        cardCount: cardsList.length,
        visibility: 'private'
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
      batches.push(firstBatch);

      // 4. Przygotowanie pozostałych kart w pakietach po 400
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
        batches.push(batch);
      }

      // 5. Wgrywanie równoległe (max 5 jednocześnie) z raportowaniem postępu
      let processedCount = 0;
      await commitBatchesWithConcurrency(batches, 5, (index) => {
        let batchSize = 0;
        if (index === 0) {
          batchSize = firstChunk.length;
        } else {
          batchSize = Math.min(chunkSize, cardsList.length - chunkSize - (index - 1) * chunkSize);
        }
        processedCount += batchSize;
        if (onProgress) {
          onProgress(processedCount);
        }
      });

      // 6. Inwalidacja pamięci podręcznej synchronizacji
      delete serverSyncCache[sharedDeckId];
    } catch (error) {
      console.error("Error cloning deck:", error);
      throw error;
    }
  };

  // Update deck metadata (name, description, visibility)
  const updateDeck = async (deckId: string, name: string, description: string, visibility: 'private' | 'public' | 'guest') => {
    if (!userId) return;
    try {
      const deckDocRef = doc(db, 'users', userId, 'decks', deckId);
      await updateDoc(deckDocRef, {
        name,
        description,
        visibility
      });
    } catch (error) {
      console.error("Error updating deck:", error);
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
    cloneSharedDeck,
    updateDeck
  };
}
