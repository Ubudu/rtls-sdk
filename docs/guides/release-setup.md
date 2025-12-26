# Release Setup Guide

This guide explains how to configure the CI/CD pipeline for releasing to GitHub and npm.

## Overview

The release pipeline is triggered when you push a version tag (e.g., `v1.0.0`) to GitLab. It will:

1. Run tests and build the SDK
2. Push the code and tag to GitHub
3. Publish the package to npm

## Prerequisites

Before your first release, you need to set up:

- A GitHub repository for the public SDK
- Two CI/CD variables in GitLab

## Step 1: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Create repository `ubudu/rtls-sdk`
3. Keep it empty (no README, no .gitignore)

## Step 2: Generate GitHub Deploy Key

Generate an SSH key pair for GitLab to push to GitHub:

```bash
ssh-keygen -t ed25519 -C "gitlab-ci-rtls-sdk" -f ~/.ssh/gitlab_to_github_rtls -N ""
```

### Add Public Key to GitHub

1. Go to `github.com/ubudu/rtls-sdk` → **Settings** → **Deploy keys**
2. Click **Add deploy key**
3. Title: `GitLab CI`
4. Paste the public key:
   ```bash
   cat ~/.ssh/gitlab_to_github_rtls.pub
   ```
5. Check **Allow write access**
6. Click **Add key**

### Add Private Key to GitLab

1. Go to your GitLab project → **Settings** → **CI/CD** → **Variables**
2. Click **Add variable**
3. Configure:
   - Key: `GITHUB_DEPLOY_KEY`
   - Value: paste the private key content (including `-----BEGIN/END-----` lines)
     ```bash
     cat ~/.ssh/gitlab_to_github_rtls
     ```
   - Type: **File**
   - Flags: Check **Protect variable** (do NOT mask - multi-line keys can't be masked)

## Step 3: Create npm Token

### Generate Token on npm

1. Go to [npmjs.com](https://www.npmjs.com) → Click your avatar → **Access Tokens**
2. Click **Generate New Token** → **Classic Token**
3. Select **Automation** (bypasses 2FA for CI/CD)
4. Copy the token (shown only once)

### Add Token to GitLab

1. Go to your GitLab project → **Settings** → **CI/CD** → **Variables**
2. Click **Add variable**
3. Configure:
   - Key: `NPM_TOKEN`
   - Value: paste the npm token
   - Type: **Variable**
   - Flags: Check **Protect variable** AND **Mask variable**

## Step 4: Protect Version Tags

Protected variables are only available to protected branches and tags. You must protect version tags for publishing to work.

1. Go to your GitLab project → **Settings** → **Repository** → **Protected tags**
2. Click **Add tag**
3. Configure:
   - Tag: `v*` (wildcard matches all version tags like `v0.1.0`, `v1.2.3`)
   - Allowed to create: **Maintainers** (or your preference)
4. Click **Protect**

This ensures only maintainers can create release tags, and those tags have access to the protected CI/CD variables.

## Step 5: First Release

Once the variables are configured:

```bash
# Update version in package.json
npm version 0.1.0

# Push with tags
git push origin main --tags
```

The pipeline will automatically:
- Push to GitHub
- Publish `ubudu-rtls-sdk@0.1.0` to npm

## Variables Summary

| Variable | Type | Protected | Masked | Description |
|----------|------|-----------|--------|-------------|
| `GITHUB_DEPLOY_KEY` | File | ✅ Yes | ❌ No | SSH private key for GitHub |
| `NPM_TOKEN` | Variable | ✅ Yes | ✅ Yes | npm automation token |

> **Important**: Both variables must be **protected** so they're only available to protected tags. The deploy key cannot be masked because it's multi-line.

## Troubleshooting

### Push to GitHub fails

- Verify the deploy key has **write access** enabled on GitHub
- Check the key is added as a **File** type variable in GitLab
- Ensure the GitHub repository exists and is empty for first push

### npm publish fails with ENEEDAUTH

```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in
```

This usually means the `NPM_TOKEN` is not available to the pipeline. Common causes:

1. **Tag not protected**: If `NPM_TOKEN` is a protected variable, the tag must also be protected
   - Check GitLab logs for `non_protected` in cache path
   - Solution: Add `v*` to protected tags (Settings → Repository → Protected tags)

2. **Variable not set**: The variable doesn't exist or has a typo
   - Verify the variable name is exactly `NPM_TOKEN`

3. **Token expired or invalid**: npm tokens can expire
   - Generate a new Automation token on npmjs.com

### Cannot delete protected tag via command line

```
remote: GitLab: You can only delete protected tags using the web interface.
```

Protected tags must be deleted through GitLab UI:
- Go to Repository → Tags → find the tag → click Delete (trash icon)
- Or retry the failed pipeline if you just needed to fix variables

### npm publish fails with 403

- Verify the npm token is an **Automation** token (not Granular or Read-only)
- Check the package name `ubudu-rtls-sdk` is available or you have publish access
- Ensure the token was created by an npm user with publish permissions

## Release Checklist

### First-time setup (once per project)
- [ ] GitHub repository created and empty
- [ ] Deploy key added to GitHub with write access
- [ ] `GITHUB_DEPLOY_KEY` variable added to GitLab (File, Protected)
- [ ] `NPM_TOKEN` variable added to GitLab (Variable, Protected, Masked)
- [ ] Protected tags configured: `v*` pattern

### For each release
- [ ] Update version in `package.json`
- [ ] Update CHANGELOG (if applicable)
- [ ] Commit changes to `main`
- [ ] Create and push tag: `git tag v0.1.0 && git push origin v0.1.0`
- [ ] Verify pipeline succeeds in GitLab
- [ ] Verify package appears on [npmjs.com](https://www.npmjs.com/package/ubudu-rtls-sdk)
- [ ] Verify code appears on GitHub
