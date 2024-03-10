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

Additional APIs like RichText and Moderation are also not included, but some alternatives are provided as
examples in the repository.

## Usage

### Doing an unauthenticated request...

```ts
const rpc = new BskyXRPC({ service: 'https://public.api.bsky.app' });

const profile = await rpc.get('app.bsky.actor.getProfile', {
	params: {
		actor: 'did:plc:ragtjsm2j2vknwkz3zp4oxrd',
	},
});

console.log(profile.data); // -> { handle: 'pfrazee.com', ... }
```

### Doing an authenticated request...

```ts
const rpc = new BskyXRPC({ service: 'https://bsky.app' });
const auth = new BskyAuth(rpc);

await auth.login({ identifier: '...', password: '...' });

const likes = await rpc.get('app.bsky.feed.getActorLikes', {
	params: {
		actor: auth.session.did,
		limit: 5,
	},
});

console.log(likes.data); // -> Array(5) [...]
```

### Fiddling with AT Protocol lexicons...

Type declarations can be accessed via the `./lexicons` module.

```ts
import type { AppBskyRichtextFacet, Brand } from '@mary/bluesky-client/lexicons';

type Facet = AppBskyRichtextFacet.Main;
type MentionFeature = Brand.Union<AppBskyRichtextFacet.Mention>;

const mention: MentionFeature = {
	$type: 'app.bsky.richtext.facet#mention',
	did: 'did:plc:ragtjsm2j2vknwkz3zp4oxrd',
};

const facet: Facet = {
	index: {
		byteStart: 7,
		byteEnd: 12,
	},
	features: [mention],
};
```

Objects are branded as unions are discriminated by the `$type` field, this means that the typings are slightly
stricter than usual (can't use `ProfileView` in functions that only accepts `ProfileViewBasic`).
