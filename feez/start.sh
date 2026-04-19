#!/bin/bash
set -euo pipefail

# Finnish Learning App - Startup Script

echo "🇫🇮 Starting Finnish Practice Worksheet Generator..."

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required but not found"
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required but not found"
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required but not found"
    exit 1
fi

echo "Setting up local Piper TTS..."
bash ./setup_piper.sh

# Check if LibreTranslate Docker image exists
if ! docker images | grep -q libretranslate/libretranslate; then
    echo "LibreTranslate Docker image not found. Downloading..."
    docker pull libretranslate/libretranslate
fi

# Start LibreTranslate Docker container if not running
if ! docker ps --format '{{.Names}}' | grep -q '^libretranslate$'; then
    echo "Starting LibreTranslate Docker container..."
    if docker ps -a --format '{{.Names}}' | grep -q '^libretranslate$'; then
        docker start libretranslate
    else
        docker run -d --name libretranslate -p 5001:5000 libretranslate/libretranslate --load-only en,fi
    fi
    echo "LibreTranslate started on http://localhost:5001"
else
    echo "LibreTranslate is already running"
fi

echo "Waiting for LibreTranslate to become ready..."
for i in $(seq 1 60); do
    if curl -fsS "http://localhost:5001/languages" >/dev/null 2>&1; then
        echo "LibreTranslate is ready"
        break
    fi

    if [ "$i" -eq 60 ]; then
        echo "Timed out waiting for LibreTranslate readiness"
        exit 1
    fi

    sleep 1
done

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "${LAN_IP:-}" ]; then
    LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')
fi

echo "Starting Flask server..."
echo "Open in this computer: http://localhost:5000"
if [ -n "${LAN_IP:-}" ]; then
    echo "Open from local network: http://${LAN_IP}:5000"
else
    echo "Could not detect LAN IP automatically. Use this machine IP with port 5000."
fi
echo "Press CTRL+C to stop the server"

python app.py
