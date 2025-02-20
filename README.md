# @mary/bluesky-client

Lightweight API client for Bluesky/AT Protocol (atproto).

> [!IMPORTANT] This is an ESM-only library, you need to configure your TypeScript correctly in order to
> correctly pick up the type declarations.

## Why?

The official `@atproto/api` library is massive, weighing in at [583 KB](https://pkg-size.dev/@atproto/api).

- The library relies on automatically generated classes and functions for representing the nature of RPC and
  namespaces, which can't be treeshaken at all if you only request to one or two endpoints.
- The library depends on `zod` and `graphemer`, and as the library is shipped in CJS format it is unlikely
  that the treeshaking will be able to get them all off, resulting in a code bloat that's especially
  noticeable if you don't also rely on said functionality or dependencies.

Which leads to this alternative library, where it makes the following tradeoffs for its size:

- The client does not attempt to validate if the responses are valid, or provide the means to check if what
  you're sending is correct during runtime. **Proceed at your own risk**.
- IPLD and blob types are represented _as-is_.
  - CID links are not converted to a CID instance, and you'd need to rely on
    [`@mary/atproto-cid`](https://jsr.io/@mary/atproto-cid) or `multiformats` if you need to parse them.
  - Byte arrays are converted to `unknown` for the time being as queries and procedures currently does not
    make use of them.
  - Blobs are not turned into a BlobRef instance.
- Additional APIs for handling rich text or moderation are not included, but there are some alternatives
  provided as examples in the repository.

The result is a very small query client that you can extend easily:

- The entire package: [4.6 KB](https://pkg-size.dev/@externdefs%2Fbluesky-client)
- `BskyXRPC` alone: 1.7 KB

## Usage

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

Unions in AT Protocol are done by discriminating the object's `$type` field, where the field only needs to
exist if it's under a union. To make this possible, objects are branded with a (nonexistent) unique symbol.
Note that object typings are slightly stricter than usual because of this (can't pass
`AppBskyActorDefs.ProfileView` in functions that expects `ProfileViewBasic`).

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
const rpc = new BskyXRPC({ service: 'https://bsky.social' });
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

### Creating a post...

```ts
const record: AppBskyFeedPost.Record = {
	createdAt: new Date().toISOString(),
	text: `Hello world!`,
};

await rpc.call('com.atproto.repo.createRecord', {
	data: {
		repo: agent.session.did,
		collection: 'app.bsky.feed.post',
		record: record,
	},
});
```
