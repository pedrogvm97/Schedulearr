@echo off
git add .
git commit -m "Fix Docker build: make API routes dynamic to avoid SQLite lock"
git push
