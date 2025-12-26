/**
 * TypedEventEmitter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypedEventEmitter, DebugLogger } from '../../src/websocket/events';

interface TestEvents {
  message: { text: string };
  error: Error;
  count: number;
  data: { id: number; name: string };
}

describe('TypedEventEmitter', () => {
  let emitter: TypedEventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<TestEvents>();
  });

  describe('on()', () => {
    it('should emit events to registered handlers', () => {
      const handler = vi.fn();

      emitter.on('message', handler);
      emitter['emit']('message', { text: 'hello' });

      expect(handler).toHaveBeenCalledWith({ text: 'hello' });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = emitter.on('message', handler);
      unsubscribe();

      emitter['emit']('message', { text: 'hello' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);
      emitter['emit']('message', { text: 'hello' });

      expect(handler1).toHaveBeenCalledWith({ text: 'hello' });
      expect(handler2).toHaveBeenCalledWith({ text: 'hello' });
    });

    it('should handle different event types', () => {
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();
      const countHandler = vi.fn();

      emitter.on('message', messageHandler);
      emitter.on('error', errorHandler);
      emitter.on('count', countHandler);

      const error = new Error('test');
      emitter['emit']('message', { text: 'hello' });
      emitter['emit']('error', error);
      emitter['emit']('count', 42);

      expect(messageHandler).toHaveBeenCalledWith({ text: 'hello' });
      expect(errorHandler).toHaveBeenCalledWith(error);
      expect(countHandler).toHaveBeenCalledWith(42);
    });
  });

  describe('once()', () => {
    it('should call handler only once', () => {
      const handler = vi.fn();

      emitter.once('message', handler);

      emitter['emit']('message', { text: 'first' });
      emitter['emit']('message', { text: 'second' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ text: 'first' });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = emitter.once('message', handler);
      unsubscribe();

      emitter['emit']('message', { text: 'hello' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('off()', () => {
    it('should remove a specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);

      emitter.off('message', handler1);
      emitter['emit']('message', { text: 'hello' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should not throw if handler does not exist', () => {
      const handler = vi.fn();

      expect(() => {
        emitter.off('message', handler);
      }).not.toThrow();
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners for a specific event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const errorHandler = vi.fn();

      emitter.on('message', handler1);
      emitter.on('message', handler2);
      emitter.on('error', errorHandler);

      emitter.removeAllListeners('message');

      emitter['emit']('message', { text: 'test' });
      emitter['emit']('error', new Error('test'));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('message', handler1);
      emitter.on('error', handler2);

      emitter.removeAllListeners();

      emitter['emit']('message', { text: 'test' });
      emitter['emit']('error', new Error('test'));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount()', () => {
    it('should return 0 for events with no listeners', () => {
      expect(emitter.listenerCount('message')).toBe(0);
    });

    it('should return correct count of listeners', () => {
      const unsub1 = emitter.on('message', () => {});
      emitter.on('message', () => {});

      expect(emitter.listenerCount('message')).toBe(2);

      unsub1();
      expect(emitter.listenerCount('message')).toBe(1);
    });
  });

  describe('hasListeners()', () => {
    it('should return false for events with no listeners', () => {
      expect(emitter.hasListeners('message')).toBe(false);
    });

    it('should return true for events with listeners', () => {
      emitter.on('message', () => {});
      expect(emitter.hasListeners('message')).toBe(true);
    });
  });

  describe('eventNames()', () => {
    it('should return empty array when no listeners', () => {
      expect(emitter.eventNames()).toEqual([]);
    });

    it('should return array of event names with listeners', () => {
      emitter.on('message', () => {});
      emitter.on('error', () => {});

      const names = emitter.eventNames();
      expect(names).toContain('message');
      expect(names).toContain('error');
      expect(names).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should catch errors in handlers and continue emitting', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      emitter.on('message', throwingHandler);
      emitter.on('message', normalHandler);

      emitter['emit']('message', { text: 'test' });

      expect(throwingHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe('DebugLogger', () => {
  let logger: DebugLogger;

  beforeEach(() => {
    logger = new DebugLogger('TestPrefix', true);
  });

  describe('log()', () => {
    it('should log messages when enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.log('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('[TestPrefix]');
      expect(consoleSpy.mock.calls[0][0]).toContain('Test message');

      consoleSpy.mockRestore();
    });

    it('should not log when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.setEnabled(false);
      logger.log('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log data when provided', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.log('Test message', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test message'),
        { key: 'value' }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error()', () => {
    it('should always log errors regardless of enabled state', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.setEnabled(false);
      logger.error('Error message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('ERROR:');

      consoleSpy.mockRestore();
    });
  });

  describe('warn()', () => {
    it('should log warnings when enabled', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger.warn('Warning message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('WARN:');

      consoleSpy.mockRestore();
    });
  });
});
