#!/bin/bash
set -euo pipefail

ARCH="${1:-amd64}"

case "$ARCH" in
    amd64)  GOARCH=amd64 ;;
    arm64)  GOARCH=arm64 ;;
    *)
        echo "Usage: $0 {amd64|arm64}"
        exit 1
        ;;
esac

echo "Building cloudflared-lib for $ARCH..."

CGO_ENABLED=1 \
GOOS=linux \
GOARCH=$GOARCH \
go build -buildmode=c-shared \
    -ldflags="-s -w" \
    -o "bot-${ARCH}.so" \
    .

echo "Done: bot-${ARCH}.so"
ls -lh "bot-${ARCH}.so"
