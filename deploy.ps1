# Script to build and deploy MemoCard to Firebase Hosting
Write-Host "🔨 Budowanie aplikacji..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Błąd podczas budowania projektu. Przerwano wdrożenie." -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Wdrażanie na Firebase Hosting..." -ForegroundColor Cyan
npx firebase-tools deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Błąd podczas wdrażania na Firebase." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Aktualizacja zakończona sukcesem!" -ForegroundColor Green
