# bluesky-client

[View on JSR](https://jsr.io/@mary/bluesky-client)\
[Source code](https://codeberg.org/mary-ext/bluesky-client)

Lightweight API client for Bluesky/AT Protocol (atproto).

> [!IMPORTANT] This is an ESM-only library, you need to configure your TypeScript correctly in order to
> correctly pick up the type declarations.

## Why?

The official `@atproto/api` library is big!
<a href="https://pkg-size.dev/@atproto/api"><img src="https://pkg-size.dev/badge/bundle/461666" title="Bundle size for @atproto/api"></a>

- The library relies on automatically generated classes and functions for representing the nature of RPC and
  namespaces, which can't be treeshaken at all if you only request to one or two endpoints.
- The library unnecessarily bundles dependencies like `graphemer` and `zod`, resulting on code duplication if
  you also use them in your projects, or bloat if you don't need to rely on said functionality at all.

Which leads to this lightweight library, which makes the following tradeoffs:

- TypeScript type definitions are provided, but the client does not validate if the responses are correct.
  **Proceed at your own risk.**
- Queries and properties are not accessed via property access, you'd have to type the NSID as a string.

```js
// ❎️
agent.app.bsky.actor.getProfile({ actor: 'did:plc:ragtjsm2j2vknwkz3zp4oxrd' });

// ✅️
rpc.get('app.bsky.actor.getProfile', {
	params: {
		actor: 'did:plc:ragtjsm2j2vknwkz3zp4oxrd',
	},
});
```
