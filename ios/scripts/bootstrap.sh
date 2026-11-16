#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen is required. Install it with: brew install xcodegen" >&2
  exit 1
fi

swift scripts/generate-icon.swift
xcodegen generate --spec project.yml
echo "Open ios/TigerSportsLive.xcodeproj in Xcode."
