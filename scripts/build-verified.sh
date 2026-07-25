#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
mkdir -p "${SITES_PROJECT_ROOT}/public/vendor"
cp "${SITES_PROJECT_ROOT}/node_modules/pdfjs-dist/build/pdf.mjs" "${SITES_PROJECT_ROOT}/public/vendor/pdf.mjs"
cp "${SITES_PROJECT_ROOT}/node_modules/pdfjs-dist/build/pdf.worker.min.mjs" "${SITES_PROJECT_ROOT}/public/vendor/pdf.worker.min.mjs"
cp "${SITES_PROJECT_ROOT}/node_modules/@fontsource/lxgw-wenkai/files/lxgw-wenkai-latin-300-normal.woff2" "${SITES_PROJECT_ROOT}/public/vendor/lxgw-wenkai.woff2"
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

"${script_dir}/validate-artifact.sh"
