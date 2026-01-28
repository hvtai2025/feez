#!/bin/bash

# Finnish Learning App - Startup Script

echo "🇫🇮 Starting Finnish Practice Worksheet Generator..."

# Check if LibreTranslate Docker image exists
if ! docker images | grep -q libretranslate/libretranslate; then
    echo "LibreTranslate Docker image not found. Downloading..."
    docker pull libretranslate/libretranslate
fi

# Start LibreTranslate Docker container if not running
if ! docker ps | grep -q libretranslate; then
    echo "Starting LibreTranslate Docker container..."
    if docker ps -a | grep -q libretranslate; then
        docker start libretranslate
    else
        docker run -d --name libretranslate -p 5001:5000 libretranslate/libretranslate --load-only en,fi
    fi
    echo "LibreTranslate started on http://localhost:5001"
else
    echo "LibreTranslate is already running"
fi

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

echo "Starting Flask server..."
echo "Open your browser to: http://localhost:5000"
echo "Press CTRL+C to stop the server"

python app.py
