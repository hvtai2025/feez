#!/bin/bash

# Clean Docker start for LibreTranslate (fresh container each run)
set -euo pipefail

CONTAINER_NAME="libretranslate"
IMAGE_NAME="libretranslate/libretranslate"
HOST_PORT="5001"
CONTAINER_PORT="5000"

echo "Starting clean LibreTranslate Docker run..."

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed or not in PATH."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running. Start Docker and try again."
    exit 1
fi

if [ -z "$(docker images -q ${IMAGE_NAME})" ]; then
    echo "Pulling ${IMAGE_NAME}..."
    docker pull "${IMAGE_NAME}"
fi

if [ -n "$(docker ps -aq -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "Removing previous container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}"
fi

echo "Starting fresh container: ${CONTAINER_NAME}"
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    "${IMAGE_NAME}" \
    --load-only en,fi

echo "Waiting for LibreTranslate readiness..."
for i in $(seq 1 60); do
    if curl -fsS "http://localhost:${HOST_PORT}/languages" >/dev/null 2>&1; then
        echo "LibreTranslate is ready"
        break
    fi

    if [ "$i" -eq 60 ]; then
        echo "Timed out waiting for LibreTranslate readiness"
        exit 1
    fi

    sleep 1
done

echo "LibreTranslate is running at http://localhost:${HOST_PORT}"
