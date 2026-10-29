#!/bin/sh
npm install axios jsdom
cd js 
node update-perks.js
cd ..
rm -rf node_modules package.json package-lock.json
git add .
git commit -m "Autoupdate"
git push
echo "Script finalizado y cambios subidos a Git"
