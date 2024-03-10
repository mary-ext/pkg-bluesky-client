// This example provides the one necessary function when fiddling around with
// user-inputted fields like rich text fields, which is counting the graphemes
// that are present in the text.

// Rely on the Intl.Segmenter API when available, only falling back to
// `graphemer` when not present. This removes the need to include ~300 kB worth
// of JavaScript code in your bundle unless necessary.

export let graphemeLen: (text: string) => number;

if ('Segmenter' in Intl) {
	const segmenter = new Intl.Segmenter();

	graphemeLen = (text) => {
		const iterator = segmenter.segment(text)[Symbol.iterator]();
		let count = 0;

		while (!iterator.next().done) {
			count++;
		}

		return count;
	};
} else {
	const { default: { default: Graphemer } } = await import('npm:graphemer@^1.4.0');
	const graphemer = new Graphemer();

	graphemeLen = graphemer.countGraphemes;
}
