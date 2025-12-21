# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Ubudu RTLS TypeScript SDK** - an official SDK for the Ubudu Real-Time Location System API. The project uses OpenAPI code generation to create type-safe TypeScript bindings from the RTLS Swagger specification.

## Development Commands

```bash
# Install dependencies
npm install

# Generate OpenAPI types from the RTLS API specification
npm run generate

# Build the SDK (outputs to dist/)
npm run build

# Run tests
npm run test              # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# Code quality
npm run lint              # Check linting
npm run lint:fix          # Fix linting issues
npm run typecheck         # TypeScript type checking
npm run format            # Format code with Prettier
npm run format:check      # Check formatting
```

## Architecture

### Code Generation Pipeline
The SDK uses `openapi-typescript` to generate TypeScript types from the Ubudu RTLS Swagger spec at `https://rtls.ubudu.com/api/docs/swagger.json`. The generated schema lives in `src/generated/schema.ts` (gitignored, regenerated on install).

### Directory Structure
```
src/
├── generated/           # Auto-generated OpenAPI types (do not edit)
├── client/              # HTTP client implementation using openapi-fetch
├── resources/           # Resource-specific API wrappers (assets, positions, zones, etc.)
├── utils/               # Pagination, filtering, and helper utilities
├── types.ts             # Re-exported and extended types
├── errors.ts            # Custom error classes (RtlsError, AuthenticationError, etc.)
└── index.ts             # Public API exports

test/
├── mocks/               # MSW request handlers for API mocking
├── resources/           # Resource-specific tests
└── setup.ts             # Vitest test setup

docs/
├── README.md            # Documentation index
├── guides/              # How-to guides (release setup, etc.)
└── development/         # Implementation specs (work package)
```

### Key Design Patterns

1. **Resource Pattern**: Each API domain (assets, positions, zones, venues, POIs, alerts) has a dedicated resource class in `src/resources/` that wraps the underlying HTTP client.

2. **Error Hierarchy**: Custom error classes extend `RtlsError` with specific types for authentication, authorization, validation, rate limiting, and network errors.

3. **Pagination Utilities**: The SDK provides `paginate()` async generator and `collectAll()` helper for traversing paginated endpoints.

4. **Filter DSL**: A fluent filter builder in `src/utils/filtering.ts` provides type-safe filter construction with operators like `eq`, `contains`, `between`, etc.

### Build Configuration
- **tsup**: Bundles to both ESM (`dist/index.js`) and CJS (`dist/index.cjs`) with TypeScript declarations
- **Target**: ES2022, Node.js >= 18
- **Module System**: ESM-first with CJS compatibility

## Documentation

- [docs/development/01_WORK_PACKAGE.md](docs/development/01_WORK_PACKAGE.md) - SDK implementation tasks (47 tasks across 9 phases). Execute sequentially, running verification commands after each task.
- [docs/guides/release-setup.md](docs/guides/release-setup.md) - Configure CI/CD for GitHub mirroring and npm publishing.

## API Specification

- **Base URL**: `https://rtls.ubudu.com/api`
- **Swagger Spec**: `https://rtls.ubudu.com/api/docs/swagger.json`
- **Authentication**: API Key (`X-API-Key` header) or Bearer token
