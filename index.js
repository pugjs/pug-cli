#!/usr/bin/env node

"use strict";

var fs = require("fs");
var path = require("path");
var { program } = require("commander");
var mkdirp = require("mkdirp");
var chalk = require("chalk");
var pug = require("pug");
var yaml = require("js-yaml");
var matter = require("gray-matter");

var basename = path.basename;
var dirname = path.dirname;
var resolve = path.resolve;
var normalize = path.normalize;
var join = path.join;
var relative = path.relative;

// options

program
  .version(
    "pug version: " +
      require("pug/package.json").version +
      "\n" +
      "@tokilabs/pug3-cli version: " +
      require("./package.json").version
  )
  .usage("[options] [dir|file ...]")
  .option("-O, --obj <str|path>", "JSON/JavaScript/YAML options object or file")
  .option(
    "-o, --out <dir>",
    "output the rendered HTML or compiled JavaScript to <dir>"
  )
  .option("-p, --path <path>", "filename used to resolve includes")
  .option(
    "-b, --basedir <path>",
    "path used as root directory to resolve absolute includes"
  )
  .option("-P, --pretty", "compile pretty HTML output")
  .option("-c, --client", "compile function for client-side")
  .option(
    "-n, --name <str>",
    "the name of the compiled template (requires --client)"
  )
  .option("-D, --no-debug", "compile without debugging (smaller functions)")
  .option("-w, --watch", "watch files for changes and automatically re-render")
  .option("-E, --extension <ext>", "specify the output file extension")
  .option("-s, --silent", "do not output logs")
  .option(
    "--name-after-file",
    "name the template after the last section of the file path (requires --client and overriden by --name)"
  )
  .option(
    "--doctype <str>",
    "specify the doctype on the command line (useful if it is not specified by the template)"
  );

program.on("--help", function () {
  console.log("  Examples:");
  console.log("");
  console.log("    # Render all files in the `templates` directory:");
  console.log("    $ pug3 templates");
  console.log("");
  console.log("    # Create {foo,bar}.html:");
  console.log("    $ pug3 {foo,bar}.pug");
  console.log("");
  console.log("    # Using `pug` over standard input and output streams");
  console.log("    $ pug3 < my.pug > my.html");
  console.log("    $ echo 'h1 Pug!' | pug");
  console.log("");
  console.log(
    "    # Render all files in `foo` and `bar` directories to `/tmp`:"
  );
  console.log("    $ pug3 foo bar --out /tmp");
  console.log("");
  console.log("    # Specify options through a string:");
  console.log('    $ pug -O \'{"doctype": "html"}\' foo.pug');
  console.log("    # or, using JavaScript instead of JSON");
  console.log("    $ pug3 -O \"{doctype: 'html'}\" foo.pug");
  console.log("");
  console.log("    # Specify options through a file:");
  console.log("    $ echo \"exports.doctype = 'html';\" > options.js");
  console.log("    $ pug3 -O options.js foo.pug");
  console.log("    # or, JSON works too");
  console.log('    $ echo \'{"doctype": "html"}\' > options.json');
  console.log("    $ pug3 -O options.json foo.pug");
  console.log("");
});

program.parse(process.argv);

var cmdOptions = program.opts();
var pugOptions = cmdOptions.obj ? parseObj(cmdOptions.obj) : {};

/**
 * Parse object either in `input` or in the file called `input`. The latter is
 * searched first.
 */
function parseObj(input) {
  let err = `PARSING ${input}\n`;
  try {
    const resolved = path.resolve(input);
    return require(resolved);
  } catch (e) {
    err += `Require didn't work for ${input}: ${e}\n`;
    let str;
    try {
      str = fs.readFileSync(cmdOptions.obj, "utf8");
    } catch (e) {
      err += ` and ${cmdOptions.obj} doesn't exist\n`;
      str = cmdOptions.obj;
    }

    err += `Trying JSON.parse ${str}\n`;
    try {
      return JSON.parse(str);
    } catch (e) {
      err += `JSON.parse ERROR ${e}\n`;
      try {
        return yaml.load(str, "utf-8");
      } catch (e) {
        err += `YAML ERROR ${e}\n`;
        err += `Trying EVAL ${str}`;

        try {
          return eval("(" + str + ")");
        } catch (e) {
          err += `EVAL ERROR: ${e}\n`;
          console.error(err);
          throw new Error(err);
        }
      }
    }
  }
}

[
  ["path", "filename"], // --path
  ["debug", "compileDebug"], // --no-debug
  ["client", "client"], // --client
  ["pretty", "pretty"], // --pretty
  ["basedir", "basedir"], // --basedir
  ["doctype", "doctype"], // --doctype
].forEach(function (o) {
  pugOptions[o[1]] =
    cmdOptions[o[0]] !== undefined ? cmdOptions[o[0]] : pugOptions[o[1]];
});

// --name

if (typeof cmdOptions.name === "string") {
  pugOptions.name = cmdOptions.name;
}

// --silent

var consoleLog = cmdOptions.silent ? function () {} : console.log;

// left-over args are file paths

var files = program.args;

// object of reverse dependencies of a watched file, including itself if
// applicable

var watchList = {};

// function for rendering
var render = cmdOptions.watch ? tryRender : renderFile;

// compile files

if (files.length) {
  consoleLog();

  if (cmdOptions.watch) {
    if (cmdOptions.obj && fs.existsSync(cmdOptions.obj)) {
      fs.watchFile(
        cmdOptions.obj,
        { persistent: true, interval: 200 },
        function () {
          consoleLog(
            "  " + chalk.yellow(cmdOptions.obj) + " " + chalk.gray("changed")
          );

          // update object without losing previous data
          Object.assign(pugOptions, parseObj(pugOptions));

          // then update all files
          for (const [path, bases] of Object.entries(watchList)) {
            if (watchList.hasOwnProperty(path)) {
              bases.forEach(render);
            }
          }
        }
      );

      consoleLog(
        "  " + chalk.gray("watching") + " " + chalk.yellow(cmdOptions.obj)
      );
    }

    process.on("SIGINT", function () {
      process.exit(1);
    });
  }
  files.forEach(function (file) {
    render(file);
  });
  // stdio
} else {
  stdin();
}

/**
 * Watch for changes on path
 *
 * Renders `base` if specified, otherwise renders `path`.
 */
function watchFile(path, base, rootPath) {
  path = normalize(path);

  var log = "  " + chalk.gray("watching") + " " + chalk.cyan(path);
  if (!base) {
    base = path;
  } else {
    base = normalize(base);
    log += "\n    " + chalk.gray("as a dependency of") + " ";
    log += chalk.cyan(base);
  }

  if (watchList[path]) {
    if (watchList[path].indexOf(base) !== -1) return;
    consoleLog(log);
    watchList[path].push(base);
    return;
  }

  consoleLog(log);
  watchList[path] = [base];
  fs.watchFile(
    path,
    { persistent: true, interval: 200 },
    function (curr, prev) {
      // File doesn't exist anymore. Keep watching.
      if (curr.mtime.getTime() === 0) return;
      // istanbul ignore if
      if (curr.mtime.getTime() === prev.mtime.getTime()) return;
      watchList[path].forEach(function (file) {
        tryRender(file, rootPath);
      });
    }
  );
}

/**
 * Convert error to string
 */
function errorToString(e) {
  return e.stack || /* istanbul ignore next */ e.message || e;
}

/**
 * Try to render `path`; if an exception is thrown it is printed to stderr and
 * otherwise ignored.
 *
 * This is used in watch mode.
 */
function tryRender(path, rootPath) {
  try {
    renderFile(path, rootPath);
  } catch (e) {
    // keep watching when error occured.
    console.error(errorToString(e) + "\x07");
  }
}

/**
 * Compile from stdin.
 */

function stdin() {
  var buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function (chunk) {
    buf += chunk;
  });
  process.stdin
    .on("end", function () {
      var output;
      if (pugOptions.client) {
        output = pug.compileClient(buf, pugOptions);
      } else {
        var fn = pug.compile(buf, pugOptions);
        var output = fn(pugOptions);
      }
      process.stdout.write(output);
    })
    .resume();
}

/**
 * Process the given path, compiling the pug files found.
 * Always walk the subdirectories.
 *
 * @param path      path of the file, might be relative
 * @param rootPath  path relative to the directory specified in the command
 */

function renderFile(path, rootPath) {
  var isPug = /\.(?:pug|jade)$/;
  var isIgnored = /([\/\\]_)|(^_)/;

  var stat = fs.statSync(path);
  // Found pug file
  if (stat.isFile() && isPug.test(path) && !isIgnored.test(path)) {
    // Try to watch the file if needed. watchFile takes care of duplicates.
    if (cmdOptions.watch) watchFile(path, null, rootPath);
    if (cmdOptions.nameAfterFile) {
      pugOptions.name = getNameFromFileName(path);
    }

    let page = matter.read(path);
    pugOptions.filename = page.path;
    if (page.data.layout) {
      page.extended = `extends ${pugOptions.includes}/${page.data.layout}
    ${page.content}`;
    } else {
      page.extended = page.content;
    }
    pugOptions.page = page.data;

    var fn = pugOptions.client
      ? pug.compileClient(page.extended, pugOptions)
      : pug.compile(page.extended, pugOptions);
    if (cmdOptions.watch && fn.dependencies) {
      // watch dependencies, and recompile the base
      fn.dependencies.forEach(function (dep) {
        watchFile(dep, path, rootPath);
      });
    }

    // --extension
    var extname;
    if (cmdOptions.extension) extname = "." + cmdOptions.extension;
    else if (pugOptions.client) extname = ".js";
    else if (cmdOptions.extension === "") extname = "";
    else extname = ".html";

    // path: foo.pug -> foo.<ext>
    path = path.replace(isPug, extname);
    if (cmdOptions.out) {
      // prepend output directory
      if (rootPath) {
        // replace the rootPath of the resolved path with output directory
        path = relative(rootPath, path);
      } else {
        // if no rootPath handling is needed
        path = basename(path);
      }
      path = resolve(cmdOptions.out, path);
    }
    var dir = resolve(dirname(path));
    mkdirp.sync(dir);
    var output = pugOptions.client ? fn : fn(pugOptions);
    fs.writeFileSync(path, output);
    consoleLog(
      "  " + chalk.gray("rendered") + " " + chalk.cyan("%s"),
      normalize(path)
    );
    // Found directory
  } else if (stat.isDirectory()) {
    var files = fs.readdirSync(path);
    files
      .map(function (filename) {
        return path + "/" + filename;
      })
      .forEach(function (file) {
        render(file, rootPath || path);
      });
  }
}

/**
 * Get a sensible name for a template function from a file path
 *
 * @param {String} filename
 * @returns {String}
 */
function getNameFromFileName(filename) {
  var file = basename(filename).replace(/\.(?:pug|jade)$/, "");
  return (
    file.toLowerCase().replace(/[^a-z0-9]+([a-z])/g, function (_, character) {
      return character.toUpperCase();
    }) + "Template"
  );
}
