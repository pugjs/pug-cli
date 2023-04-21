# @anduh/pug-cli

PUG 3 CLI interface

[![Dependency Status](https://img.shields.io/david/anduh/pug-cli.svg)](https://david-dm.org/anduh/pug-cli)
[![NPM version](https://img.shields.io/npm/v/@anduh/pug-cli.svg)](https://www.npmjs.org/package/@anduh/pug-cli)
[![Coverage Status](https://img.shields.io/codecov/c/github/anduh/pug-cli.svg)](https://codecov.io/gh/anduh/pug-cli)

**@anduh/pug-cli** is a CLI for rendering [PUG](https://pugjs.org/), updated to PUG 3. It's a fork of the original [pug-cli](https://www.npmjs.com/package/pug-cli), which still uses PUG 2.

**warning:** this is my first try at publishing an npm package, so this might not work.

## Usage

```
$ pug3 [options] [dir|file ...]
```

Render `<file>`s and all files in `<dir>`s. If no files are specified,
input is taken from standard input and output to standard output.

### Options

```
-h, --help             output usage information
-V, --version          output the version number
-O, --obj <str|path>   JSON/JavaScript/YAML options object or file
-o, --out <dir>        output the rendered HTML or compiled JavaScript to
                       <dir>
-p, --path <path>      filename used to resolve includes
-b, --basedir          path used as root directory to resolve absolute includes
-P, --pretty           compile pretty HTML output
-c, --client           compile function for client-side runtime.js
-n, --name <str>       the name of the compiled template (requires --client)
-D, --no-debug         compile without debugging (smaller functions)
-w, --watch            watch files for changes and automatically re-render
-E, --extension <ext>  specify the output file extension
-s, --silent           do not output logs
--name-after-file      name the template after the last section of the file
                       path (requires --client and overriden by --name)
--doctype <str>        specify the doctype on the command line (useful if it
                       is not specified by the template)
```

### Examples

Render all files in the `templates` directory:

```
$ pug3 templates
```

Create `{foo,bar}.html`:

```
$ pug3 {foo,bar}.pug
```

Using `pug` over standard input and output streams:

```
$ pug3 < my.pug > my.html
$ echo "h1 Pug!" | pug
```

Render all files in `foo` and `bar` directories to `/tmp`:

```
$ pug3 foo bar --out /tmp
```

Specify options through a string:

```
$ pug3 -O '{"doctype": "html"}' foo.pug
# or, using JavaScript instead of JSON
$ pug3 -O "{doctype: 'html'}" foo.pug
```

Specify options through a file:

```
$ echo "exports.doctype = 'html';" > options.js
$ pug3 -O options.js foo.pug
# or, JSON works too
$ echo '{"doctype": "html"}' > options.json
$ pug3 -O options.json foo.pug
# YAML works as well
$ pug3 -O options.yaml foo.pug
```

## Installation

    npm install @anduh/pug-cli -g

## Original
The original project this was forked from:
* [github.com/pugjs/pug-cli](https://github.com/pugjs/pug-cli)

## License

MIT
