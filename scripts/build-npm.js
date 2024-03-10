import * as path from 'jsr:@std/path@^0.219.1';

import fg from 'npm:fast-glob@^3.3.2';

import * as esbuild from 'npm:esbuild@~0.20.1';
// import * as esl from 'npm:es-module-lexer@^1.4.1';

import ts from 'npm:typescript@~5.4.2';

import djson from '../deno.json' with { type: 'json' };

const dest = `npm`;

await Deno.remove(dest, { recursive: true }).catch((err) => {
	if (err instanceof Deno.errors.NotFound) {
		return;
	}

	return Promise.reject(err);
});
await Deno.mkdir(dest, { recursive: true });

console.log(`building source code`);
{
	const IMPORT_TS_RE = /\.ts$/;
	const IMPORT_CODE_RE = /(?<= from (['"]))(.+?\.ts)(?=\1)/g;

	const srcdir = 'lib/';
	const destdir = 'npm/dist';

	const files = await fg('**/*.ts', { cwd: srcdir });

	// await esl.init;

	console.log(`  writing files`);
	await Promise.all(files.map(async (name) => {
		const srcname = path.join(srcdir, name);
		const destname = path.join(destdir, name.replace(IMPORT_TS_RE, '.js'));

		const source = await Deno.readTextFile(srcname);

		/** @type {string} */
		let code;

		{
			const result = await esbuild.transform(source, {
				loader: 'ts',
			});

			code = result.code;
		}

		// {
		// 	const [imports, _exports] = esl.parse(code);

		// 	let res = '';
		// 	let pos = 0;

		// 	for (let i = 0, il = imports.length; i < il; i++) {
		// 		const decl = imports[i];
		// 		const specifier = decl.n;

		// 		if (!IMPORT_TS_RE.test(specifier)) {
		// 			continue;
		// 		}

		// 		res += code.slice(pos, decl.s);
		// 		res += specifier.replace(IMPORT_TS_RE, '.js');

		// 		pos = decl.e;
		// 	}

		// 	code = res + code.slice(pos);
		// }

		{
			code = code.replace(IMPORT_CODE_RE, (specifier) => {
				return specifier.slice(0, -3) + '.js';
			});
		}

		await Deno.mkdir(path.dirname(destname), { recursive: true });
		await Deno.writeTextFile(destname, code);
	}));

	console.log(`  generating declaration files`);
	{
		/** @type {Map<string, string>} */
		const vfs = new Map();
		const inputs = files.map((name) => path.join(srcdir, name));

		/** @type {ts.CompilerOptions} */
		const compilerOptions = {
			allowJs: true,
			declaration: true,
			emitDeclarationOnly: true,
			incremental: true,
			skipLibCheck: true,
			strictNullChecks: true,
		};

		const host = ts.createCompilerHost(compilerOptions);
		const program = ts.createProgram(inputs, compilerOptions, host);

		{
			const _readFile = host.readFile;

			host.readFile = (filename) => {
				let contents = vfs.get(filename);
				if (contents === undefined) {
					contents = _readFile(filename);
				}

				return contents;
			};
			host.writeFile = (filename, contents) => {
				vfs.set(filename, contents);
			};
		}

		program.emit();

		{
			const srcabs = path.join(Deno.cwd(), srcdir);

			await Promise.all(Array.from(vfs, async ([absname, contents]) => {
				const relname = path.relative(srcabs, absname);
				const destname = path.join(destdir, relname);

				let code = contents;

				{
					code = code.replace(IMPORT_CODE_RE, (specifier) => {
						return specifier.slice(0, -3) + '.js';
					});
				}

				await Deno.mkdir(path.dirname(destname), { recursive: true });
				await Deno.writeTextFile(destname, code);
			}));
		}
	}
}

console.log(`writing meta files`);
{
	const pkg = {
		type: 'module',
		name: '@externdefs/bluesky-client',
		description: 'Lightweight API client for Bluesky/AT Protocol',
		version: djson.version,
		author: {
			name: 'Mary',
			url: 'https://mary.my.id',
		},
		license: 'MIT',
		repository: {
			url: 'https://codeberg.org/mary-ext/pkg-bluesky-client',
		},
		exports: {
			'.': {
				types: './dist/mod.d.ts',
				default: './dist/mod.js',
			},
			'./lexicons': {
				types: './dist/lexicons.d.ts',
				default: './dist/lexicons.js',
			},
			'./xrpc': {
				types: './dist/xrpc.d.ts',
				default: './dist/xrpc.js',
			},
			'./utils/jwt': {
				types: './dist/utils/jwt.d.ts',
				default: './dist/utils/jwt.js',
			},
		},
	};

	await Promise.all([
		Deno.copyFile(`LICENSE`, `${dest}/LICENSE`),
		Deno.copyFile(`README.md`, `${dest}/README.md`),
		Deno.writeTextFile(`${dest}/package.json`, JSON.stringify(pkg, null, 2)),
	]);
}
