#!/bin/bash
# Detect the Replit environment and construct the backend URL.
# REPLIT_DEV_DOMAIN = <id>.pike.replit.dev (port 5000 default)
# Backend runs on port 3001, so its domain is <id>-3001.pike.replit.dev

if [ -n "$REPLIT_DEV_DOMAIN" ]; then
  FIRST=$(echo "$REPLIT_DEV_DOMAIN" | cut -d'.' -f1)
  REST=$(echo "$REPLIT_DEV_DOMAIN" | cut -d'.' -f2-)
  export EXPO_PUBLIC_SERVER_URL="https://${FIRST}-3001.${REST}"
  echo "[alcovia] Backend URL: $EXPO_PUBLIC_SERVER_URL"
else
  export EXPO_PUBLIC_SERVER_URL="http://localhost:3001"
  echo "[alcovia] Local dev — backend: $EXPO_PUBLIC_SERVER_URL"
fi

exec npx expo start --web --port 5000
