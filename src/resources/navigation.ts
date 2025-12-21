import { BaseClient, type RequestOptions } from '../client/base';

export interface ShortestPathRequest {
  startNodeId: string;
  endNodeId: string;
  options?: {
    avoidStairs?: boolean;
    avoidElevators?: boolean;
  };
}

export interface AccessiblePathRequest {
  startNodeId: string;
  endNodeId: string;
  accessibility: 'wheelchair' | 'visuallyImpaired';
  preferElevator?: boolean;
}

export interface MultiStopRequest {
  nodeIds: string[];
  algorithm: 'nearest' | 'optimal';
  options?: {
    returnToStart?: boolean;
  };
}

/**
 * NavigationResource provides navigation-related operations.
 * Note: Navigation endpoints are planned features - these methods provide
 * the interface for when the API supports navigation operations.
 */
export class NavigationResource {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_client: BaseClient) {
    // Client stored for future navigation API implementation
  }

  /**
   * Calculate the shortest path between two nodes.
   * @throws Will throw until navigation API is available
   */
  async shortestPath(
    _namespace: string,
    _request: ShortestPathRequest,
    _requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    throw new Error('Navigation API not yet available');
  }

  /**
   * Calculate an accessible path between two nodes.
   * @throws Will throw until navigation API is available
   */
  async accessiblePath(
    _namespace: string,
    _request: AccessiblePathRequest,
    _requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    throw new Error('Navigation API not yet available');
  }

  /**
   * Calculate a path visiting multiple nodes.
   * @throws Will throw until navigation API is available
   */
  async multiStop(
    _namespace: string,
    _request: MultiStopRequest,
    _requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    throw new Error('Navigation API not yet available');
  }

  /**
   * Find the nearest POI from a starting node.
   * @throws Will throw until navigation API is available
   */
  async nearestPoi(
    _namespace: string,
    _startNodeId: string,
    _requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    throw new Error('Navigation API not yet available');
  }

  /**
   * Calculate an evacuation route from a starting node.
   * @throws Will throw until navigation API is available
   */
  async evacuation(
    _namespace: string,
    _startNodeId: string,
    _requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    throw new Error('Navigation API not yet available');
  }
}
