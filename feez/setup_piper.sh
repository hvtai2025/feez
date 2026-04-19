#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIPER_VERSION="2023.11.14-2"
PIPER_DIR="$ROOT_DIR/vendor/piper"
PIPER_BIN_DIR="$PIPER_DIR/piper"
PIPER_VOICE_DIR="$PIPER_DIR/voices"
ARCHIVE_PATH="$PIPER_DIR/piper_linux_x86_64.tar.gz"
PIPER_RELEASE_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz"
MODEL_NAME="fi_FI-harri-medium.onnx"
MODEL_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fi/fi_FI/harri/medium/${MODEL_NAME}?download=true"
MODEL_CONFIG_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fi/fi_FI/harri/medium/${MODEL_NAME}.json?download=true"

mkdir -p "$PIPER_BIN_DIR" "$PIPER_VOICE_DIR"

if [ ! -x "$PIPER_BIN_DIR/piper" ]; then
    echo "Downloading Piper binary..."
    curl -L "$PIPER_RELEASE_URL" -o "$ARCHIVE_PATH"
    tar -xzf "$ARCHIVE_PATH" -C "$PIPER_DIR"
fi

if [ ! -f "$PIPER_VOICE_DIR/$MODEL_NAME" ]; then
    echo "Downloading Finnish Piper model..."
    curl -L "$MODEL_URL" -o "$PIPER_VOICE_DIR/$MODEL_NAME"
fi

if [ ! -f "$PIPER_VOICE_DIR/$MODEL_NAME.json" ]; then
    echo "Downloading Finnish Piper model config..."
    curl -L "$MODEL_CONFIG_URL" -o "$PIPER_VOICE_DIR/$MODEL_NAME.json"
fi

chmod +x "$PIPER_BIN_DIR/piper"

echo "Piper is ready: $PIPER_BIN_DIR/piper"
echo "Model is ready: $PIPER_VOICE_DIR/$MODEL_NAME"