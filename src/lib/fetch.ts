/// <reference lib="dom" />

/*
https://github.com/transitive-bullshit/chatgpt-api
*/

const fetch = globalThis.fetch;

if (typeof fetch !== 'function') {
  throw new Error('Invalid environment: global fetch not defined')
}

export { fetch }