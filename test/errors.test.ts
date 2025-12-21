import { describe, it, expect } from 'vitest';
import {
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  createError,
} from '../src';

describe('Error classes', () => {
  describe('RtlsError', () => {
    it('should create error with all properties', () => {
      const error = new RtlsError('Test error', 500, { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(500);
      expect(error.body).toEqual({ detail: 'test' });
      expect(error.name).toBe('RtlsError');
    });

    it('should identify client errors', () => {
      const error = new RtlsError('Bad request', 400, null);
      expect(error.isClientError()).toBe(true);
      expect(error.isServerError()).toBe(false);
    });

    it('should identify server errors', () => {
      const error = new RtlsError('Server error', 500, null);
      expect(error.isClientError()).toBe(false);
      expect(error.isServerError()).toBe(true);
    });
  });

  describe('createError', () => {
    it('should create AuthenticationError for 401', () => {
      const error = createError(401, { error: 'Invalid token' });
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.status).toBe(401);
    });

    it('should create AuthorizationError for 403', () => {
      const error = createError(403, { error: 'Forbidden' });
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.status).toBe(403);
    });

    it('should create NotFoundError for 404', () => {
      const error = createError(404, { error: 'Not found' });
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.status).toBe(404);
    });

    it('should create ValidationError for 422', () => {
      const error = createError(422, { error: 'Validation failed' });
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.status).toBe(422);
    });

    it('should create RateLimitError for 429', () => {
      const error = createError(429, { error: 'Too many requests' });
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.status).toBe(429);
    });

    it('should create generic RtlsError for other status codes', () => {
      const error = createError(500, { error: 'Server error' });
      expect(error).toBeInstanceOf(RtlsError);
      expect(error).not.toBeInstanceOf(AuthenticationError);
    });
  });
});
