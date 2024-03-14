# Changelog

## 0.5.0

The package exports has been changed around to better reflect the name of this package.

- `.` for Bluesky-related functionalities, now front and center.
- `./lexicons` for the lexicon typings.
- `./xrpc` for access to the actual XRPC client.

XRPC client has been reimplemented from scratch, reducing the bundle size from 2768 b (1278 b gz) to 1736 b
(927 b) and introduces the ability to add hooks for request interception.

```js
const rpc = new XRPC({ service: '...' });

// Hooks are executed from last-registered to first-registered, so you'd need to
// think of how you're registering these hooks.

// Add authentication functionality
rpc.hook((next) => async (request) => {
	let result = next({ ...request, headers: { ...request.headers, 'Authorization': 'Bearer ...' } });

	if (isErrorResponse(result.data, ['ExpiredToken'])) {
		// ... refresh session

		// redo the request
		result = next({ ...request, headers: { ...request.headers } });
	}

	return result;
});

// Add logging functionality
rpc.hook((next) => (request) => {
	console.log(`${request.type} ${request.nsid}`);
	return next(request);
});

// Now make your requests!
const response = await rpc.query('com.atproto.server.describeServer', {});
// logs `get com.atproto.server.describeServer`
```

As a result, the `Agent` class, which extends the XRPC to add authentication/session management
functionalities, is no longer needed.

Instead, there's now 3 classes:

- `BskyXRPC` which adds Bluesky lexicon typings to the XRPC
- `BskyAuth` for authentication/session management
- `BskyMod` for labeler/moderation purposes. This is a new and unstable API.

```js
const rpc = new BskyXRPC({ service: 'https://bsky.social' });
const auth = new BskyAuth(rpc, {
	onRefresh() {},
	onExpired() {},
});

// `BskyAuth` exposes login and session resumption methods
await auth.login({ identifier: 'mary.my.id', password: '...' });

// Let's retrieve our own likes...
const response = await rpc.get('app.bsky.feed.getActorLikes', {
	params: {
		actor: auth.session.did,
		limit: 5,
	},
});

response.data; // -> Array(5) [...]
```

### 0.5.6

The ability to clone and subsequently add a proxy middleware has been added, available within the `/xrpc`
submodule.

```ts
const rpc = new BskyXRPC({ service: 'https://bsky.social' });
const proxied = withProxy(rpc, { service: 'did:web:bsky.social', type: 'atproto_labeler' });

// Make reports
await proxied.call('com.atproto.moderation.createReport', {
	data: {
		reasonType: 'com.atproto.moderation.defs#reasonViolation',
		reason: `Awful behavior`,
		subject: { did: 'did:web:bob.com' },
	},
});
```
