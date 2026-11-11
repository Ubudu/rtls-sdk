#!/bin/sh
# Runs one CI step: in-container.sh <image> <command> [args...]
#
# On a Docker executor the job already runs inside its image, so the command is run as it is. On a shell executor
# (a host with docker, git and a shell, but no Node.js) the same command runs inside <image>, with the checkout
# mounted at /work. The container runs as the calling user so that the files it writes into the checkout can be
# removed by the runner; set CI_CONTAINER_ROOT=1 for a step that needs root in the container (ssh needs a passwd
# entry for its user). HOME is a scratch folder of the container; the npm cache stays in the checkout (.npm/).
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: in-container.sh <image> <command> [args...]" >&2
  exit 2
fi
image="$1"
shift

if [ -f /.dockerenv ] || ! command -v docker >/dev/null 2>&1; then
  exec "$@"
fi

user=""
if [ "${CI_CONTAINER_ROOT:-}" != "1" ]; then
  user="--user $(id -u):$(id -g)"
fi

# shellcheck disable=SC2086
exec docker run --rm --init $user \
  -e HOME=/tmp/ci-home \
  -e npm_config_cache=/work/.npm \
  -e npm_config_prefix=/tmp/ci-home/.npm-global \
  -e CI -e NODE_VERSION -e BUN_VERSION \
  -e CI_COMMIT_TAG -e NPM_TOKEN -e GITHUB_DEPLOY_KEY \
  -e RTLS_API_KEY -e APP_NAMESPACE -e RTLS_BASE_URL \
  -v "$PWD:/work" -w /work \
  "$image" "$@"
