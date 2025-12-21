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
   - Value: paste the private key content
     ```bash
     cat ~/.ssh/gitlab_to_github_rtls
     ```
   - Type: **File**
   - Flags: Check **Mask variable**

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
   - Flags: Check **Mask variable**

## Step 4: First Release

Once the variables are configured:

```bash
# Update version in package.json
npm version 0.1.0

# Push with tags
git push origin main --tags
```

The pipeline will automatically:
- Push to GitHub
- Publish `@ubudu/rtls-sdk@0.1.0` to npm

## Variables Summary

| Variable | Type | Description |
|----------|------|-------------|
| `GITHUB_DEPLOY_KEY` | File | SSH private key with write access to GitHub |
| `NPM_TOKEN` | Variable | npm automation token for publishing |

## Troubleshooting

### Push to GitHub fails

- Verify the deploy key has **write access** enabled
- Check the key is added as a **File** type variable in GitLab
- Ensure the GitHub repository exists and is empty

### npm publish fails

- Verify the npm token is an **Automation** token
- Check the package name `@ubudu/rtls-sdk` is available or you have access
- Ensure the token has publish permissions

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Update CHANGELOG (if applicable)
- [ ] Commit changes
- [ ] Create and push tag: `git tag v1.0.0 && git push --tags`
- [ ] Verify pipeline succeeds in GitLab
- [ ] Verify package appears on [npmjs.com](https://www.npmjs.com/package/@ubudu/rtls-sdk)
- [ ] Verify code appears on GitHub
