import * as path from 'jsr:@std/path@^0.219.1';

import { untar } from 'jsr:@mary/tar@^0.2.0';

import $ from 'jsr:@david/dax@~0.39.2';

const repo = `bluesky-social/atproto`;

async function main() {
	let sha;
	{
		console.log(`retrieving latest commit`);
		const response = await fetch(`https://api.github.com/repos/${repo}/commits?path=lexicons/`);

		if (!response.ok) {
			console.log(`  response error ${response.status}`);
			return;
		}

		const json = await response.json();
		const latest = json[0];

		if (!latest) {
			console.log(`  latest commit missing?`);
			return;
		}

		sha = latest.sha;
		console.log(`  got ${sha}`);
	}

	const tmpdir = `lexicons-tmp/`;

	{
		console.log(`retrieving zip file`);
		const response = await fetch(`https://github.com/${repo}/archive/${sha}.tar.gz`);

		if (!response.ok) {
			console.log(`  response error ${response.status}`);
			return;
		}

		const basename = `atproto-${sha}/lexicons/`;

		const ds = new DecompressionStream('gzip');
		const stream = response.body.pipeThrough(ds);

		const promises = [];

		console.log(`  reading`);
		for await (const entry of untar(stream)) {
			if (entry.type === 'file' && entry.name.startsWith(basename)) {
				const buffer = new Uint8Array(await entry.arrayBuffer());

				const promise = (async () => {
					const name = entry.name.slice(basename.length);
					const basedir = tmpdir + path.dirname(name);

					await Deno.mkdir(basedir, { recursive: true });
					await Deno.writeFile(tmpdir + name, buffer);
				})();

				promises.push(promise);
			}
		}

		console.log(`  flushing writes`);
		await Promise.all(promises);
	}

	{
		console.log(`running deno fmt`);
		await $`deno fmt -q ${tmpdir}`;
	}

	{
		const source = `https://github.com/${repo}/tree/${sha}/lexicons\n`;

		console.log(`writing readme file`);
		await Deno.writeTextFile(tmpdir + `README.md`, source);
	}

	{
		const dest = `lexicons/`;

		console.log(`moving folder`);
		await Deno.remove(dest, { recursive: true });
		await Deno.rename(tmpdir, dest);
	}
}

await main();
