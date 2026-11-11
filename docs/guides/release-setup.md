# Release setup

How the SDK is built, checked and released. Maintainers only.

## 1. Pipelines

The **GitLab pipeline** (`.gitlab-ci.yml`) is canonical. GitHub (`github.com/ubudu/rtls-sdk`) is a mirror that
GitLab pushes to on every release tag; its workflows (`.github/workflows/`) repeat the offline checks for the
mirror.

| Stage | Job | Runs on | What it does |
|---|---|---|---|
| `offline` | `offline` (Node 20, 22, 24) | merge requests, the default branch, tags | `npm ci`, installs Bun 1.4.4 as a consumer runtime, then `npm run ci:offline`: spec check, lint, format check, typecheck, unit coverage, contract tests, build, pack smoke test, docs snippets and links |
| `live` | `live-readonly` (Node 22) | the default branch, **manual** | read-only integration run (`npm run test:integration`, no tier variable) and the sweeper check; present only when the protected, masked variables `RTLS_API_KEY` and `APP_NAMESPACE` are defined |
| `live` | `spec-drift` | scheduled pipelines only | `npm run spec:drift`: compares the vendored spec with the live one (informational, may fail) |
| `release` | `push-to-github` | tags `vX.Y.Z` | pushes the tagged commit to the mirror's `main` and pushes the tag |
| `release` | `publish-npm` | tags `vX.Y.Z` | `npm run generate`, `npm run build`, `npm publish --access public` |

Release jobs start only after the `offline` stage of the tag pipeline has passed. Nothing in the offline lane
reaches the network after the installs.

GitHub workflows:

- `ci.yml`: on pushes to `main` and `develop` and on pull requests to `main`, job `build` runs the same
  `npm run ci:offline` on Node 20, 22 and 24 (Bun 1.4.4 installed for the pack smoke test), then job
  `publish-dry-run` runs `npm pack --dry-run`.
- `release.yml`: a manual workflow (version input) that bumps the version, tags, pushes and publishes from
  GitHub with the GitHub secret `NPM_TOKEN`. It is not part of the canonical flow: releases are tagged on GitLab.
  Never run it for a version that GitLab publishes.

## 2. The vendored spec

The OpenAPI spec is vendored in `spec/rtls-api.swagger.json`. `npm run generate` (also run by `npm run build`
and on `npm install` through `prepare`) builds `src/generated/schema.ts` from that file only; no build step
downloads anything.

- `npm run spec:check` (part of `ci:offline`) checks that the vendored file is normalised, matches
  `spec/spec.lock.json`, and that regenerating the types gives exactly the local `src/generated/schema.ts` (a
  stale or hand-edited schema fails; the file is generated, not committed).
- `npm run spec:update` replaces it with the live spec and rewrites the lock file (a deliberate maintainer
  step, reviewed like code); then run `npm run generate && npm run spec:check`.
- `npm run spec:drift` reports differences between the vendored and the live spec; it is informational.

## 3. One-time setup

### GitHub mirror and deploy key

1. Create the repository `ubudu/rtls-sdk` on GitHub, empty.
2. Generate a key pair for GitLab to push with:

   ```bash
   ssh-keygen -t ed25519 -C "gitlab-ci-rtls-sdk" -f ~/.ssh/gitlab_to_github_rtls -N ""
   ```

3. On GitHub, **Settings → Deploy keys → Add deploy key**: paste the public key (`~/.ssh/gitlab_to_github_rtls.pub`),
   tick **Allow write access**.
4. On GitLab, **Settings → CI/CD → Variables → Add variable**:
   - Key `GITHUB_DEPLOY_KEY`, value the private key (`~/.ssh/gitlab_to_github_rtls`, including the
     `BEGIN`/`END` lines).
   - Type **Variable**, not File: the job pipes the variable's content to `ssh-add -`, and a File variable
     would hand it a path instead of the key.
   - **Protect variable** ticked. It cannot be masked (multi-line value).

### npm token

1. On npmjs.com, create an **Automation** token for an account that may publish `ubudu-rtls-sdk`.
2. On GitLab, add the variable `NPM_TOKEN`: type **Variable**, **Protect variable** and **Mask variable** ticked.

### Protected tags

Protected variables are only given to protected branches and tags. Under **Settings → Repository → Protected
tags**, protect `v*` (allowed to create: maintainers).

| Variable | Type | Protected | Masked | Used by |
|---|---|---|---|---|
| `GITHUB_DEPLOY_KEY` | Variable | yes | no (multi-line) | `push-to-github` |
| `NPM_TOKEN` | Variable | yes | yes | `publish-npm` |
| `RTLS_API_KEY`, `APP_NAMESPACE` | Variable | yes | yes | `live-readonly` (optional) |

## 4. Release checklist

1. On the default branch, the pipeline is green: `npm run ci:offline` passes locally too.
2. The generated documentation is current (not part of `ci:offline`): `npm run docs:api:check` and
   `npm run docs:coverage:check` pass.
3. `CHANGELOG.md`: the release section is complete; replace `Unreleased` in its heading with the release date
   when tagging.
4. The migration guide covers every breaking change of the release.
5. Bump the version: `npm version <x.y.z> --no-git-tag-version`, commit `package.json` and `package-lock.json`.
6. Tag and push the tag: `git tag v<x.y.z> && git push origin v<x.y.z>`.
7. Check the tag pipeline: `offline` passes, then `push-to-github` and `publish-npm`.
8. Check the package on npmjs.com (`ubudu-rtls-sdk@<x.y.z>`) and the tag on the GitHub mirror.

## 5. Troubleshooting

### `push-to-github` fails at `ssh-add`

- `GITHUB_DEPLOY_KEY` is a File variable: change its type to **Variable**.
- The value lost its line breaks or the `BEGIN`/`END` lines: paste the whole private key again.

### `push-to-github` is rejected by GitHub

- The deploy key has no write access on the GitHub repository.

### `npm publish` fails with `ENEEDAUTH`

The job did not receive `NPM_TOKEN`:

1. The tag is not protected while the variable is: protect `v*`.
2. The variable name is not exactly `NPM_TOKEN`.
3. The token expired: create a new Automation token.

### `npm publish` fails with 403

- The token is not an Automation token, or its account may not publish `ubudu-rtls-sdk`.
- The version already exists on npm: versions cannot be republished; bump and tag again.

### A protected tag cannot be deleted from the command line

GitLab deletes protected tags only from the web interface (**Repository → Tags**). To repeat a release after
fixing variables, retry the failed jobs of the tag pipeline instead.
