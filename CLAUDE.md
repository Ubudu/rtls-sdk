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
npm run test              # Single run (unit tests with MSW mocks)
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run test:integration  # Integration tests against live API (requires .env)

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

### Work Packages

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 1 | [01_WORK_PACKAGE.md](docs/development/01_WORK_PACKAGE.md) | COMPLETED | SDK implementation (47 tasks, 9 phases) |
| 2 | [02_API_VALIDATION_WORKPACKAGE.md](docs/development/02_API_VALIDATION_WORKPACKAGE.md) | COMPLETED | API validation testing (68 tasks, 11 phases) |
| 3 | [03_SDK_ALIGNMENT_WORKPACKAGE.md](docs/development/03_SDK_ALIGNMENT_WORKPACKAGE.md) | COMPLETED | SDK alignment for v1.0.0 (28 tasks, 11 phases) |
| 4 | [04_SDK_DOCUMENTATION_WORKPACKAGE.md](docs/development/04_SDK_DOCUMENTATION_WORKPACKAGE.md) | COMPLETED | Examples & documentation (52 tasks, 12 phases) |
| 5 | [05_SDK_ERGONOMICS_WORKPACKAGE.md](docs/development/05_SDK_ERGONOMICS_WORKPACKAGE.md) | PENDING | Default context & ergonomics (33 tasks, 10 phases) |

### Reports (from WP #2)

- [API_VALIDATION_RESULTS.md](docs/development/API_VALIDATION_RESULTS.md) - Test results for each endpoint
- [API_SCHEMA_REPORT.md](docs/development/API_SCHEMA_REPORT.md) - Actual vs expected schemas
- [SDK_FIX_RECOMMENDATIONS.md](docs/development/SDK_FIX_RECOMMENDATIONS.md) - Required SDK changes

### API Documentation Proposals

- [04_SWAGGER_DOCUMENTATION_CHANGES.md](docs/development/04_SWAGGER_DOCUMENTATION_CHANGES.md) - Proposed Swagger spec updates for RTLS API team

### Guides

- [Getting Started](docs/guides/getting-started.md) - Installation, configuration, first API calls
- [Asset Tracking](docs/guides/asset-tracking.md) - Asset CRUD, positions, history, statistics
- [Zone & Geofencing](docs/guides/zone-geofencing.md) - Zones, spatial queries, presence detection
- [Navigation](docs/guides/navigation.md) - POIs, paths, indoor routing
- [Error Handling](docs/guides/error-handling.md) - Error types, retry strategies
- [Advanced Patterns](docs/guides/advanced-patterns.md) - Pagination, filtering, batch processing
- [Release Setup](docs/guides/release-setup.md) - CI/CD for GitHub mirroring and npm publishing

## Integration Testing

Integration tests require API credentials in a `.env` file (not committed):

```bash
# Copy the example and fill in your credentials
cp .env.example .env

# Run integration tests
npm run test:integration
```

Required environment variables:
- `APP_NAMESPACE` - Your application namespace
- `RTLS_API_KEY` - Your API key for authentication

## API Specification

- **Base URL**: `https://rtls.ubudu.com/api`
- **Swagger Spec**: `https://rtls.ubudu.com/api/docs/swagger.json`
- **Authentication**: API Key (`X-API-Key` header) or Bearer token
