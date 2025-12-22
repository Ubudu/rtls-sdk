import type { PaginatedResponse } from '../types';

/**
 * Normalizes API responses that may be arrays or paginated objects.
 * Converts direct arrays to PaginatedResponse format for consistency.
 */
export function normalizeListResponse<T>(
  response: T[] | PaginatedResponse<T>
): PaginatedResponse<T> {
  if (Array.isArray(response)) {
    return {
      data: response,
      page: 1,
      limit: response.length,
      total: response.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }
  return response;
}

/**
 * Checks if response is a direct array (not paginated).
 */
export function isArrayResponse<T>(response: T[] | PaginatedResponse<T>): response is T[] {
  return Array.isArray(response);
}

/**
 * Extracts data array from either format.
 * Handles: direct arrays, { data: T[] }, or PaginatedResponse
 */
export function extractDataArray<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response as T[];
  }
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T[] }).data;
  }
  return [];
}
