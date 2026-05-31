#!/bin/bash
# Script to build and deploy MemoCard to Firebase Hosting

echo -e "\033[0;36m🔨 Budowanie aplikacji...\033[0m"
npm --no-git-tag-version version patch
npm run build

if [ $? -eq 0 ]; then
    echo -e "\033[0;36m🚀 Wdrażanie na Firebase Hosting...\033[0m"
    npx firebase-tools deploy
    if [ $? -eq 0 ]; then
        echo -e "\033[0;32m✅ Aktualizacja zakończona sukcesem!\033[0m"
    else
        echo -e "\033[0;31m❌ Błąd podczas wdrażania na Firebase.\033[0m"
        exit 1
    fi
else
    echo -e "\033[0;31m❌ Błąd podczas budowania projektu. Przerwano wdrożenie.\033[0m"
    exit 1
fi
