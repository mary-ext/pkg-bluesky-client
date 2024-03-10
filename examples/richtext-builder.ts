// This example demonstrates a builder for creating Bluesky's rich texts.

import { AppBskyRichtextFacet, At } from '../lib/lexicons.ts';

import { graphemeLen } from './richtext-grapheme.ts';

type UnwrapArray<T> = T extends (infer V)[] ? V : never;

type Facet = AppBskyRichtextFacet.Main;
type FacetFeature = UnwrapArray<Facet['features']>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
	const buf = new Uint8Array(a.length + b.length);
	buf.set(a, 0);
	buf.set(b, a.length);

	return buf;
};

class RichTextBuilder {
	private buffer = new Uint8Array(0);
	private facets: Facet[] = [];

	build(): { text: string; facets: Facet[]; length: number } {
		const text = decoder.decode(this.buffer);
		return { text: text, facets: this.facets, length: graphemeLen(text) };
	}

	text(substr: string): this {
		this.buffer = concat(this.buffer, encoder.encode(substr));
		return this;
	}

	feature(substr: string, feature: FacetFeature): this {
		const start = this.buffer.length;
		const end = this.text(substr).buffer.length;

		this.facets.push({
			index: { byteStart: start, byteEnd: end },
			features: [feature],
		});

		return this;
	}

	mention(substr: string, did: At.DID): this {
		return this.feature(substr, { $type: 'app.bsky.richtext.facet#mention', did });
	}

	link(substr: string, uri: string): this {
		return this.feature(substr, { $type: 'app.bsky.richtext.facet#link', uri });
	}
}

const rt = new RichTextBuilder()
	.text('hello, ')
	.mention('@user', 'did:plc:blah')
	.text('! please visit my ')
	.link('website', 'https://example.com')
	.build();

console.log(rt.text); // "hello, @user! please visit my website"
console.log(rt.length); // 37
console.log(rt.facets); // [{ index: { byteStart: 7, byteEnd: 12 }, ... }
