# Script to build and deploy MemoCard to Firebase Hosting
Write-Host "Budowanie aplikacji..." -ForegroundColor Cyan
npm --no-git-tag-version version patch
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Blad podczas budowania projektu. Przerwano wdrozenie." -ForegroundColor Red
    exit 1
}

Write-Host "Wdrazanie na Firebase Hosting..." -ForegroundColor Cyan
npx firebase-tools deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Blad podczas wdrazania na Firebase." -ForegroundColor Red
    exit 1
}

Write-Host "Aktualizacja zakonczona sukcesem!" -ForegroundColor Green
