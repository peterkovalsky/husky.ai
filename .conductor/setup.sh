MAIN_REPO="/Users/peter/git/HuskyStudio/husky.ai/husky.ai"
WS="$CONDUCTOR_WORKSPACE_PATH"

for env_file in api/.env frontend/.env worker/.env scripts/.env; do
  if [ -f "$MAIN_REPO/$env_file" ]; then
    mkdir -p "$(dirname "$WS/$env_file")"
    cp "$MAIN_REPO/$env_file" "$WS/$env_file"
    echo "Copied $env_file"
  fi
done

printf '\nVITE_API_BASE_URL=http://localhost:%s\n' "$CONDUCTOR_PORT" >> "$WS/frontend/.env"
echo "Patched frontend VITE_API_BASE_URL to port $CONDUCTOR_PORT"

(cd "$WS/api" && npm install) &
(cd "$WS/frontend" && npm install) &
(cd "$WS/worker" && npm install) &
wait

echo "Setup complete."
