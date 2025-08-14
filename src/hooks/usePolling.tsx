import { useEffect, useRef } from 'react';

export const usePolling = (
  callback: () => Promise<void> | void,
  interval: number,
  enabled: boolean = true
): void => {
  const savedCallback = useRef<() => Promise<void> | void>();
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    const tick = async () => {
      if (savedCallback.current) {
        try {
          await savedCallback.current();
        } catch (error) {
          console.error('Error in polling callback:', error);
        }
      }
    };

    if (enabled && interval > 0) {
      // Call once immediately
      tick();
      
      // Then set up recurring calls
      intervalId.current = setInterval(tick, interval);
      
      return () => {
        if (intervalId.current) {
          clearInterval(intervalId.current);
          intervalId.current = null;
        }
      };
    }
    
    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
        intervalId.current = null;
      }
    };
  }, [interval, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
  }, []);
};