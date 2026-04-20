#!/usr/bin/env bash
#
# Downloads the pdfium native library into src-tauri/pdfium/ so that
# `cargo tauri build` can bundle it as an app resource. The release CI
# workflow runs this same logic inline.
#
# Usage:
#   scripts/fetch-pdfium.sh            # auto-detect host OS
#   scripts/fetch-pdfium.sh linux
#   scripts/fetch-pdfium.sh windows
#
# Pinned to a specific bblanchon/pdfium-binaries release with SHA-256 digests
# verified against GitHub's release asset metadata.

set -euo pipefail

PDFIUM_TAG="chromium/7789"
SHA256_LINUX_X64="c30e092dc491b74bb666e6d35cd8d126102dad90fa87a722e16b312a2cd66c52"
SHA256_WIN_X64="5d93c5b5677bc38c5b13f5f2314fd4e0cd6c79b311797a2545644a10ce94180d"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$repo_root/src-tauri/pdfium"
mkdir -p "$dest"

host="${1:-}"
if [ -z "$host" ]; then
  case "$(uname -s)" in
    Linux*) host="linux" ;;
    MINGW*|MSYS*|CYGWIN*) host="windows" ;;
    *) echo "Unsupported host OS: $(uname -s)" >&2; exit 1 ;;
  esac
fi

case "$host" in
  linux)
    asset="pdfium-linux-x64.tgz"
    expected="$SHA256_LINUX_X64"
    libfile="lib/libpdfium.so"
    outfile="libpdfium.so"
    ;;
  windows)
    asset="pdfium-win-x64.tgz"
    expected="$SHA256_WIN_X64"
    libfile="bin/pdfium.dll"
    outfile="pdfium.dll"
    ;;
  *)
    echo "Unsupported target: $host (expected 'linux' or 'windows')" >&2
    exit 1
    ;;
esac

url="https://github.com/bblanchon/pdfium-binaries/releases/download/$PDFIUM_TAG/$asset"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Fetching $url"
curl --proto '=https' --tlsv1.2 -fL --retry 3 -o "$tmp/$asset" "$url"

actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
if [ "$actual" != "$expected" ]; then
  echo "pdfium checksum mismatch for $asset" >&2
  echo "  expected: $expected" >&2
  echo "  actual:   $actual" >&2
  exit 1
fi

tar -xzf "$tmp/$asset" -C "$tmp"
cp "$tmp/$libfile" "$dest/$outfile"
echo "Installed $dest/$outfile ($PDFIUM_TAG)"
