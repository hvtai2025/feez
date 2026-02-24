#!/bin/bash
# Finnish Learning App - macOS Startup Script


echo "🇫🇮 Starting Finnish Practice Worksheet Generator..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker Desktop for Mac and ensure it is running."
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Docker does not appear to be running. Please start Docker Desktop."
    exit 1
fi

# Check if LibreTranslate image exists
if [ -z "$(docker images -q libretranslate/libretranslate)" ]; then
    echo "Pulling LibreTranslate Docker image..."
    docker pull libretranslate/libretranslate
fi

# Check if LibreTranslate container is running
if [ -z "$(docker ps -q -f name=libretranslate)" ]; then
    # Check if container exists but is stopped
    if [ -n "$(docker ps -aq -f name=libretranslate)" ]; then
        echo "Starting existing LibreTranslate container..."
        docker start libretranslate
    else
        echo "Running new LibreTranslate container..."
        docker run -d --name libretranslate -p 5001:5000 libretranslate/libretranslate --load-only en,fi
    fi
    echo "LibreTranslate started on http://localhost:5001"
else
    echo "LibreTranslate is already running"
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.7+ and rerun this script."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "Failed to create virtual environment."
        exit 1
    fi
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start Flask server
echo "Starting Flask server..."
echo "Open your browser to: http://localhost:5000"
echo "Press CTRL+C to stop the server"
python app.py
