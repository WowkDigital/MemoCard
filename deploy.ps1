# Script to build and deploy MemoCard to Firebase Hosting
Write-Host "🔨 Budowanie aplikacji..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "🚀 Wdrażanie na Firebase Hosting..." -ForegroundColor Cyan
    npx firebase-tools deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Aktualizacja zakończona sukcesem!" -ForegroundColor Green
    } else {
        Write-Host "❌ Błąd podczas wdrażania na Firebase." -ForegroundColor Red
        Exit 1
    }
} else {
    Write-Host "❌ Błąd podczas budowania projektu. Przerwano wdrożenie." -ForegroundColor Red
    Exit 1
}
