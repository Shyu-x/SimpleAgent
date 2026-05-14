#!/bin/sh
# ==========================================
# AI Chat Backend - Docker Entry Script
# ==========================================

set -e

echo "=========================================="
echo "Starting AI Chat Backend..."
echo "=========================================="

# Wait for dependencies to be ready
echo "Checking dependencies..."

# Check Qdrant if configured
if [ -n "$QDRANT_HOST" ]; then
    echo "Waiting for Qdrant at $QDRANT_HOST:$QDRANT_PORT..."
    until curl -sf "http://$QDRANT_HOST:$QDRANT_PORT/readyz" > /dev/null 2>&1; do
        echo "Qdrant not ready, waiting..."
        sleep 2
    done
    echo "Qdrant is ready!"
fi

echo "=========================================="
echo "Starting Node.js application..."
echo "=========================================="

# Execute the main application
exec node src/index.js