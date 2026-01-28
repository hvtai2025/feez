#!/bin/bash

# Finnish Learning App - Startup Script

echo "🇫🇮 Starting Finnish Practice Worksheet Generator..."

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
