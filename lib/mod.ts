import type {
	At,
	ComAtprotoServerCreateSession,
	ComAtprotoServerRefreshSession,
	Procedures,
	Queries,
} from './lexicons.ts';
import { decodeJwt } from './utils/jwt.ts';

import {
	fetchHandler,
	isErrorResponse,
	XRPC,
	XRPCError,
	type XRPCOptions,
	type XRPCRequest,
} from './xrpc.ts';

/** Interface for the access token, for convenience */
export interface AtpAccessJwt {
	/** Access token scope, app password returns a different scope. */
	scope: 'com.atproto.access' | 'com.atproto.appPass';
	/** Account DID */
	sub: At.DID;
	/** Expiration time */
	exp: number;
	/** Creation/issued time */
	iat: number;
}

/** Interface for the refresh token, for convenience */
export interface AtpRefreshJwt {
	/** Refresh token scope */
	scope: 'com.atproto.refresh';
	/** ID of this refresh token */
	jti: string;
	/** Account DID */
	sub: At.DID;
	/** Intended audience of this refresh token, in DID */
	aud: At.DID;
	/** Expiration time */
	exp: number;
	/** Creation/issued time */
	iat: number;
}

/** Saved session data, this can be reused again for next time. */
export interface AtpSessionData {
	/** Refresh token */
	refreshJwt: string;
	/** Access token */
	accessJwt: string;
	/** Account handle */
	handle: string;
	/** Account DID */
	did: At.DID;
	/** PDS endpoint found in the DID document, this will be used as the service URI if provided */
	pdsUri?: string;
	/** Email address of the account, might not be available if on app password */
	email?: string;
	/** If the email address has been confirmed or not */
	emailConfirmed?: boolean;
}

/** Additional options for constructing an authentication middleware */
export interface BskyAuthOptions {
	/** This function gets called if the session has been refreshed during an XRPC request */
	onRefresh?: (session: AtpSessionData) => void;
	/** This function gets called if the session turned out to have expired during an XRPC request */
	onExpired?: (session: AtpSessionData) => void;
}

/** Authentication/session management middleware */
export class BskyAuth {
	#rpc: BskyXRPC;
	#refreshSessionPromise?: Promise<void>;

	#onRefresh: BskyAuthOptions['onRefresh'];
	#onExpired: BskyAuthOptions['onExpired'];

	/** Current session state */
	session?: AtpSessionData;

	constructor(rpc: BskyXRPC, { onRefresh, onExpired }: BskyAuthOptions = {}) {
		this.#rpc = rpc;
		this.#onRefresh = onRefresh;
		this.#onExpired = onExpired;

		rpc.hook((next) => async (request) => {
			await this.#refreshSessionPromise;

			let res = await next(this.#decorateRequest(request));

			if (isErrorResponse(res.body, ['ExpiredToken']) && this.session?.refreshJwt) {
				await this.#refreshSession();

				if (this.session) {
					// retry fetch
					res = await next(this.#decorateRequest(request));
				}
			}

			return res;
		});
	}

	#decorateRequest(req: XRPCRequest): XRPCRequest {
		const session = this.session;

		if (session && !req.headers['Authorization']) {
			return {
				...req,
				service: session.pdsUri || req.service,
				headers: {
					...req.headers,
					Authorization: session.accessJwt,
				},
			};
		}

		return req;
	}

	#refreshSession() {
		return (this.#refreshSessionPromise ||= this.#refreshSessionInner().finally(() => {
			this.#refreshSessionPromise = undefined;
		}));
	}

	async #refreshSessionInner() {
		const session = this.session!;

		if (!session || !session.refreshJwt) {
			return;
		}

		const res = await fetchHandler({
			service: session.pdsUri || this.#rpc.service,
			type: 'post',
			nsid: 'com.atproto.server.refreshSession',
			headers: {
				Authorization: `Bearer ${session.refreshJwt}`,
			},
			params: {},
		});

		if (isErrorResponse(res.body, ['ExpiredToken', 'InvalidToken'])) {
			// failed due to a bad refresh token
			this.session = undefined;
			this.#onExpired?.(session);
		} else if (res.status === 200) {
			// succeeded, update the session
			this.#updateSession(res.body as ComAtprotoServerRefreshSession.Output);
			this.#onRefresh?.(this.session!);
		}
	}

	#updateSession(raw: ComAtprotoServerCreateSession.Output): AtpSessionData {
		const didDoc = raw.didDoc as DidDocument | undefined;

		let pdsUri: string | undefined;
		if (didDoc) {
			pdsUri = getPdsEndpoint(didDoc);
		}

		return this.session = {
			accessJwt: raw.accessJwt,
			refreshJwt: raw.refreshJwt,
			handle: raw.handle,
			did: raw.did,
			pdsUri: pdsUri,
			email: raw.email,
			emailConfirmed: raw.emailConfirmed,
		};
	}

	/**
	 * Resume a saved session
	 * @param session Session information, taken from `BskyAuth#session` after login
	 */
	async resume(session: AtpSessionData): Promise<AtpSessionData> {
		const now = Date.now() / 1000 + 60 * 5;

		const refreshToken = decodeJwt(session.refreshJwt) as AtpRefreshJwt;

		if (now >= refreshToken.exp) {
			throw new XRPCError(401, { kind: 'InvalidToken' });
		}

		const accessToken = decodeJwt(session.accessJwt) as AtpAccessJwt;
		this.session = session;

		if (now >= accessToken.exp) {
			await this.#refreshSession();
		} else {
			const promise = this.#rpc.get('com.atproto.server.getSession', {});

			promise.then((response) => {
				const existing = this.session;
				const next = response.data;

				if (!existing) {
					return;
				}

				this.#updateSession({
					...existing,
					handle: next.handle,
					didDoc: next.didDoc,
					email: next.email,
					emailConfirmed: next.emailConfirmed,
				});
			});
		}

		if (!this.session) {
			throw new XRPCError(401, { kind: 'InvalidToken' });
		}

		return this.session;
	}

	/**
	 * Perform a login operation
	 * @param options Login options
	 * @returns Session data that can be saved for later
	 */
	async login(options: AuthLoginOptions): Promise<AtpSessionData> {
		// Reset the session
		this.session = undefined;

		const res = await this.#rpc.call('com.atproto.server.createSession', {
			data: {
				identifier: options.identifier,
				password: options.password,
			},
		});

		return this.#updateSession(res.data);
	}
}

/** Login options */
export interface AuthLoginOptions {
	/** What account to login as, this could be domain handle, DID, or email address */
	identifier: string;
	/** Account password */
	password: string;
}

/** Options for constructing a moderation middleware */
export interface BskyModOptions {
	labelers?: At.DID[];
	authorities?: At.DID[];
}

/** Moderation middleware, unstable. */
export class BskyMod {
	labelers: At.DID[];
	authorities: At.DID[];

	constructor(rpc: BskyXRPC, { labelers = [], authorities = [] }: BskyModOptions = {}) {
		this.labelers = labelers;
		this.authorities = authorities;

		rpc.hook((next) => (request) => {
			return next({
				...request,
				headers: {
					...request.headers,
					'atproto-mod-authorities': this.authorities.join(','),
					'atproto-labelers': this.labelers.join(','),
				},
			});
		});
	}
}

/** XRPC instance with Bluesky lexicons */
export type BskyXRPC = XRPC<Queries, Procedures>;

/** XRPC class with Bluesky lexicons */
// deno-lint-ignore no-explicit-any
export const BskyXRPC: { new (opts: XRPCOptions): BskyXRPC } = XRPC as any;

/**
 * Retrieves AT Protocol PDS endpoint from the DID document, if available
 * @param doc DID document
 * @returns The PDS endpoint, if available
 */
export const getPdsEndpoint = (doc: DidDocument): string | undefined => {
	return getServiceEndpoint(doc, '#atproto_pds', 'AtprotoPersonalDataServer');
};

/**
 * Retrieve a service endpoint from the DID document, if available
 * @param doc DID document
 * @param serviceId Service ID
 * @param serviceType Service type
 * @returns The requested service endpoint, if available
 */
export const getServiceEndpoint = (
	doc: DidDocument,
	serviceId: string,
	serviceType: string,
): string | undefined => {
	const did = doc.id;

	const didServiceId = did + serviceId;
	const found = doc.service?.find((service) => service.id === serviceId || service.id === didServiceId);

	if (!found || found.type !== serviceType || typeof found.serviceEndpoint !== 'string') {
		return undefined;
	}

	return validateUrl(found.serviceEndpoint);
};

const validateUrl = (urlStr: string): string | undefined => {
	let url;
	try {
		url = new URL(urlStr);
	} catch {
		return undefined;
	}

	const proto = url.protocol;

	if (url.hostname && (proto === 'http:' || proto === 'https:')) {
		return urlStr;
	}
};

/**
 * DID document
 */
export interface DidDocument {
	id: string;
	alsoKnownAs?: string[];
	verificationMethod?: Array<{
		id: string;
		type: string;
		controller: string;
		publicKeyMultibase?: string;
	}>;
	service?: Array<{
		id: string;
		type: string;
		serviceEndpoint: string | Record<string, unknown>;
	}>;
}
