pkill -f ngrok 2>/dev/null

export API_PORT=$CONDUCTOR_PORT
export FRONTEND_PORT=$((CONDUCTOR_PORT + 1))
export WORKER_PORT=$((CONDUCTOR_PORT + 2))

npx concurrently --names api,frontend,worker,ngrok --prefix-colors blue,green,yellow,magenta \
  "cd '$CONDUCTOR_WORKSPACE_PATH/api' && PORT=$API_PORT npm run dev" \
  "cd '$CONDUCTOR_WORKSPACE_PATH/frontend' && VITE_API_BASE_URL=http://localhost:$API_PORT npx vite --port $FRONTEND_PORT" \
  "cd '$CONDUCTOR_WORKSPACE_PATH/worker' && WORKER_PORT=$WORKER_PORT npm run dev" \
  "ngrok http $WORKER_PORT --log=stdout"
