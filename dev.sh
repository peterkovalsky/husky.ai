#!/usr/bin/env bash
# Launches api, worker, and frontend in parallel for local development.
# Streams each process's output with a colored prefix and shuts everything
# down cleanly on Ctrl+C.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ANSI colors per service
C_API="\033[36m"      # cyan
C_WORKER="\033[35m"   # magenta
C_FRONT="\033[32m"    # green
C_WARN="\033[33m"     # yellow
C_ERR="\033[31m"      # red
C_RESET="\033[0m"

pids=()

cleanup() {
  echo
  echo -e "${C_WARN}[dev] Shutting down...${C_RESET}"
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      # Kill the entire process group so npm/nodemon children also die
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    fi
  done
  # Give them a moment, then force-kill any stragglers
  sleep 1
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    fi
  done
  exit 0
}
trap cleanup INT TERM

# Pre-flight: bail loudly if any of our ports are already taken.
# A silent port conflict will look like "server starts then exits cleanly".
check_port() {
  local port="$1"
  local name="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    local owner
    owner=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2, $1}')
    echo -e "${C_ERR}[dev] Port $port (intended for $name) is already in use by PID $owner.${C_RESET}"
    echo -e "${C_ERR}      Stop the conflicting process or change the port in .env.${C_RESET}"
    return 1
  fi
}

port_conflict=0
check_port 3433 api      || port_conflict=1
check_port 3434 worker   || port_conflict=1
check_port 5174 frontend || port_conflict=1
if [[ $port_conflict -eq 1 ]]; then
  exit 1
fi

# Pre-flight checks
for d in api worker frontend; do
  if [[ ! -d "$REPO_ROOT/$d" ]]; then
    echo -e "${C_ERR}[dev] Missing directory: $d${C_RESET}"
    exit 1
  fi
  if [[ ! -f "$REPO_ROOT/$d/.env" ]]; then
    echo -e "${C_WARN}[dev] Warning: $d/.env not found — service may fail to start${C_RESET}"
  fi
done

# Nudge user toward the local-dev queue setup
if [[ -f "$REPO_ROOT/api/.env" ]]; then
  if ! grep -qE '^QUEUE_PROVIDER=direct' "$REPO_ROOT/api/.env"; then
    echo -e "${C_WARN}[dev] api/.env: QUEUE_PROVIDER is not 'direct' — API will use Cloud Tasks (needs ngrok).${C_RESET}"
    echo -e "${C_WARN}      Set QUEUE_PROVIDER=direct and WORKER_URL=http://localhost:3334 to skip the tunnel.${C_RESET}"
  fi
fi

# Run a service: cd into its dir, exec npm run dev, prefix every output line.
# Backgrounded with `setsid` so each service has its own process group for clean teardown.
run_service() {
  local name="$1"
  local color="$2"
  local dir="$3"
  local prefix
  prefix=$(printf "${color}[%-7s]${C_RESET}" "$name")

  (
    cd "$REPO_ROOT/$dir" || exit 1
    # Detach stdin so nodemon (which watches stdin for 'rs') doesn't get
    # SIGTTIN or interpret a non-TTY parent as a session-closed signal,
    # which would cause its ts-node child to exit cleanly on startup.
    exec npm run dev </dev/null 2>&1
  ) | while IFS= read -r line; do
    printf "%b %s\n" "$prefix" "$line"
  done &

  pids+=($!)
}

echo -e "${C_WARN}[dev] Starting api (3433), worker (3434), frontend (5174)...${C_RESET}"
echo -e "${C_WARN}[dev] Press Ctrl+C to stop all services.${C_RESET}"
echo

run_service "api"      "$C_API"    "api"
run_service "worker"   "$C_WORKER" "worker"
# Tell Vite where the API is so its /api proxy targets the right backend
export API_PORT=3433
run_service "frontend" "$C_FRONT"  "frontend"

# Wait for any child to exit; if one dies, tear the rest down too.
# Polling loop instead of `wait -n` for compatibility with macOS bash 3.2.
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo -e "${C_ERR}[dev] A service (pid $pid) exited — shutting down the others.${C_RESET}"
      cleanup
    fi
  done
  sleep 1
done
