// This example provides a way to segmentize the facets into usable segments
// that can then be rendered in UI.

import type { AppBskyRichtextFacet, Brand } from '../lib/lexicons.ts';

type Facet = AppBskyRichtextFacet.Main;
type LinkFeature = Brand.Union<AppBskyRichtextFacet.Link>;
type MentionFeature = Brand.Union<AppBskyRichtextFacet.Mention>;
type TagFeature = Brand.Union<AppBskyRichtextFacet.Tag>;

export interface RichTextSegment {
	text: string;
	link?: LinkFeature;
	mention?: MentionFeature;
	tag?: TagFeature;
}

const createSegment = (text: string, facet?: Facet): RichTextSegment => {
	let link: LinkFeature | undefined;
	let mention: MentionFeature | undefined;
	let tag: TagFeature | undefined;

	if (facet) {
		const features = facet.features;

		for (let idx = 0, len = features.length; idx < len; idx++) {
			const feature = features[idx];
			const type = feature.$type;

			if (type === 'app.bsky.richtext.facet#link') {
				link = feature;
			} else if (type === 'app.bsky.richtext.facet#mention') {
				mention = feature;
			} else if (type === 'app.bsky.richtext.facet#tag') {
				tag = feature;
			}
		}
	}

	return { text, link, mention, tag };
};

export const segmentRichtext = (rtText: string, facets: Facet[] | undefined): RichTextSegment[] => {
	if (!facets || facets.length === 0) {
		return [createSegment(rtText)];
	}

	const text = createUtfString(rtText);

	const segments: RichTextSegment[] = [];
	const length = getUtf8Length(text);

	const facetsLength = facets.length;

	let textCursor = 0;
	let facetCursor = 0;

	do {
		const facet = facets[facetCursor];
		const { byteStart, byteEnd } = facet.index;

		if (textCursor < byteStart) {
			// Text cursor is behind the facet's position, push out raw text.
			segments.push(createSegment(sliceUtf8(text, textCursor, byteStart)));
		} else if (textCursor > byteStart) {
			// Text cursor is ahead of facet's position, skip this one.
			facetCursor++;
			continue;
		}

		if (byteStart < byteEnd) {
			const subtext = sliceUtf8(text, byteStart, byteEnd);

			if (subtext.trim().length === 0) {
				// Don't push out faceted segments with empty text.
				segments.push(createSegment(subtext));
			} else {
				segments.push(createSegment(subtext, facet));
			}
		}

		textCursor = byteEnd;
		facetCursor++;
	} while (facetCursor < facetsLength);

	if (textCursor < length) {
		segments.push(createSegment(sliceUtf8(text, textCursor, length)));
	}

	return segments;
};

// UTF8 functionalities
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface UtfString {
	u16: string;
	u8: Uint8Array;
}

const createUtfString = (utf16: string): UtfString => {
	return {
		u16: utf16,
		u8: encoder.encode(utf16),
	};
};

const getUtf8Length = (utf: UtfString): number => {
	return utf.u8.byteLength;
};

const sliceUtf8 = (utf: UtfString, start?: number, end?: number): string => {
	return decoder.decode(utf.u8.slice(start, end));
};
