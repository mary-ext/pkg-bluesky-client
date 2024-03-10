// deno-lint-ignore-file no-explicit-any ban-types

export type Headers = Record<string, string>;

export const enum ResponseType {
	Unknown = 1,
	InvalidResponse = 2,
	IllegalMiddleware = 3,

	Success = 200,
	InvalidRequest = 400,
	AuthRequired = 401,
	Forbidden = 403,
	XRPCNotSupported = 404,
	PayloadTooLarge = 413,
	RateLimitExceeded = 429,
	InternalServerError = 500,
	MethodNotImplemented = 501,
	UpstreamFailure = 502,
	NotEnoughResouces = 503,
	UpstreamTimeout = 504,
}

export type RequestType = 'get' | 'post';

export interface XRPCRequest {
	service: string;
	type: RequestType;
	nsid: string;
	headers: Headers;
	params: Record<string, unknown>;
	encoding?: string;
	input?: Blob | ArrayBufferView | Record<string, unknown>;
	signal?: AbortSignal;
}

export class XRPCResponse<T = any> {
	constructor(
		public data: T,
		public headers: Headers,
	) {}
}

export interface XRPCErrorOptions {
	kind?: string;
	message?: string;
	headers?: Headers;
	cause?: unknown;
}

export class XRPCError extends Error {
	name = 'XRPCError';

	status: number;
	kind?: string;
	headers: Headers;

	constructor(status: number, { kind, message, headers, cause }: XRPCErrorOptions = {}) {
		super(message || `Unspecified error message`, { cause });

		this.status = status;
		this.kind = kind;
		this.headers = headers || {};
	}
}

export interface XRPCFetchReturn {
	status: number;
	headers: Headers;
	body: unknown;
}

export type XRPCFetch = (req: XRPCRequest) => Promise<XRPCFetchReturn>;
export type XRPCHook = (next: XRPCFetch) => XRPCFetch;

export interface XRPCOptions {
	service: string;
}

interface BaseRPCOptions {
	/** `Content-Type` encoding for the input, defaults to `application/json` if passing a JSON object */
	encoding?: string;
	/** Request headers to make */
	headers?: Headers;
	/** Signal for aborting the request */
	signal?: AbortSignal;
}

export type RPCOptions<T> =
	& BaseRPCOptions
	& (T extends { params: any } ? { params: T['params'] } : {})
	& (T extends { input: any } ? { data: T['input'] } : {});

type OutputOf<T> = T extends { output: any } ? T['output'] : never;
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export class XRPC<Queries, Procedures> {
	/** The service it should connect to */
	service: string;

	#fetch: XRPCFetch = fetchHandler;

	constructor(options: XRPCOptions) {
		this.service = options.service;
	}

	/**
	 * Adds a hook to intercept XRPC requests.
	 * Hooks are executed from last-registered to first-registered
	 * @param fn Hook function
	 */
	hook(fn: XRPCHook) {
		this.#fetch = fn(this.#fetch);
	}

	/**
	 * Makes a query (GET) request
	 * @param nsid Namespace ID of a query endpoint
	 * @param options Options to include like parameters
	 * @returns The response of the request
	 */
	get<K extends keyof Queries>(
		nsid: K,
		options: RPCOptions<Queries[K]>,
	): Promise<XRPCResponse<OutputOf<Queries[K]>>> {
		return this.#call({ type: 'get', nsid: nsid as any, ...options });
	}

	/**
	 * Makes a procedure (POST) request
	 * @param nsid Namespace ID of a procedure endpoint
	 * @param options Options to include like input body or parameters
	 * @returns The response of the request
	 */
	call<K extends keyof Procedures>(
		nsid: K,
		options: RPCOptions<Procedures[K]>,
	): Promise<XRPCResponse<OutputOf<Procedures[K]>>> {
		return this.#call({ type: 'post', nsid: nsid as any, ...options });
	}

	async #call(request: PartialBy<Omit<XRPCRequest, 'service'>, 'headers' | 'params'>): Promise<XRPCResponse> {
		const { status, headers, body } = await this.#fetch({
			...request,
			service: this.service,
			headers: request.headers === undefined ? {} : request.headers,
			params: request.params === undefined ? {} : request.params,
		});

		if (status === ResponseType.Success) {
			return new XRPCResponse(body, headers);
		} else if (isErrorResponse(body)) {
			throw new XRPCError(status, { kind: body.error, message: body.message, headers });
		} else {
			throw new XRPCError(status, { headers });
		}
	}
}

/** Fetch handler */
export const fetchHandler: XRPCFetch = async (
	{ service, type, nsid, headers, params, encoding, input, signal },
) => {
	const uri = new URL(`/xrpc/${nsid}`, service);
	const searchParams = uri.searchParams;

	for (const key in params) {
		const value = params[key];

		if (value !== undefined) {
			if (Array.isArray(value)) {
				for (let idx = 0, len = value.length; idx < len; idx++) {
					const val = value[idx];
					searchParams.append(key, val);
				}
			} else {
				searchParams.set(key, value as any);
			}
		}
	}

	const isProcedure = type === 'post';
	const isJson = typeof input === 'object' && !(input instanceof Blob || ArrayBuffer.isView(input));

	const response = await fetch(uri, {
		signal: signal,
		method: isProcedure ? 'POST' : 'GET',
		headers: encoding || isJson ? { ...headers, 'Content-Type': encoding || 'application/json' } : headers,
		body: isJson ? JSON.stringify(input) : input,
	});

	const responseHeaders = response.headers;
	const responseType = responseHeaders.get('Content-Type');

	let promise: Promise<unknown> | undefined;
	let data: unknown;

	if (responseType) {
		if (responseType.startsWith('application/json')) {
			promise = response.json();
		} else if (responseType.startsWith('text/')) {
			promise = response.text();
		}
	}

	try {
		data = await (promise || response.arrayBuffer().then((buffer) => new Uint8Array(buffer)));
	} catch (err) {
		throw new XRPCError(ResponseType.InvalidResponse, {
			cause: err,
			message: `Failed to parse response body`,
		});
	}

	return {
		status: response.status,
		headers: Object.fromEntries(responseHeaders),
		body: data,
	};
};

export const isErrorResponse = (value: any, names?: string[]): value is ErrorResponseBody => {
	if (typeof value !== 'object' || !value) {
		return false;
	}

	const kindType = typeof value.error;
	const messageType = typeof value.message;

	return (
		(kindType === 'undefined' || kindType === 'string') &&
		(messageType === 'undefined' || messageType === 'string') &&
		(!names || names.includes(kindType))
	);
};

/** Response body from a thrown query/procedure */
export interface ErrorResponseBody {
	error?: string;
	message?: string;
}
