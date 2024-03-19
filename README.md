# bluesky-client

[View on JSR](https://jsr.io/@mary/bluesky-client)\
[Source code](https://codeberg.org/mary-ext/pkg-bluesky-client)

Lightweight API client for Bluesky/AT Protocol (atproto).

> [!IMPORTANT] This is an ESM-only library, you need to configure your TypeScript correctly in order to
> correctly pick up the type declarations.

## Why?

The official `@atproto/api` library is massive, weighing in at [583 KB](https://pkg-size.dev/@atproto/api)

- The library relies on automatically generated classes and functions for representing the nature of RPC and
  namespaces, which can't be treeshaken at all if you only request to one or two endpoints.
- The library depends on `zod` and `graphemer`, and as the library is shipped in CJS format, it's very
  unlikely that treeshaking will be able to get them all off, resulting in a code bloat that's especially
  noticeable if you don't also rely on said functionality or dependencies.

Which leads to this lightweight library, where it makes the following tradeoffs:

- Additional APIs for handling rich text or moderation are not included, but there are some alternatives
  provided as examples in the repository.
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

The result is a very small query client that you can extend easily:

- The entire package: [4.6 KB](https://pkg-size.dev/@externdefs%2Fbluesky-client)
- `BskyXRPC` alone: 1.7 KB

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
