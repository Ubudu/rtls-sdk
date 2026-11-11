#!/bin/sh
# Release: push the tagged commit to the main branch of the GitHub mirror, then the tag.
set -eu
MIRROR="git@github.com:ubudu/rtls-sdk.git"
mkdir -p "$HOME/.ssh"
if ! command -v ssh-add >/dev/null 2>&1 && command -v apk >/dev/null 2>&1; then
  apk add --no-cache git openssh-client
fi
git config --global --add safe.directory "$PWD"
eval "$(ssh-agent -s)" >/dev/null
trap 'ssh-agent -k >/dev/null 2>&1 || true' EXIT
printf '%s\n' "$GITHUB_DEPLOY_KEY" | tr -d '\r' | ssh-add -
ssh-keyscan github.com >>"$HOME/.ssh/known_hosts" 2>/dev/null
# ssh reads known_hosts from the home of the passwd entry, not from HOME: name the file.
GIT_SSH_COMMAND="ssh -o UserKnownHostsFile=$HOME/.ssh/known_hosts -o StrictHostKeyChecking=yes"
export GIT_SSH_COMMAND
git push "$MIRROR" HEAD:refs/heads/main --force
git push "$MIRROR" "refs/tags/$CI_COMMIT_TAG"
