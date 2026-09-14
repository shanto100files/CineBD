const noop = () => {};

const devLog = __DEV__
  ? (...args: any[]) => console.log('[Cinepix]', ...args)
  : noop;

const devWarn = __DEV__
  ? (...args: any[]) => console.warn('[Cinepix]', ...args)
  : noop;

const devError = __DEV__
  ? (...args: any[]) => console.error('[Cinepix]', ...args)
  : noop;

export {devLog, devWarn, devError};
