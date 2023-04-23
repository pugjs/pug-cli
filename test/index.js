"use strict";
console.log("RUNNING MY TESTS");

const fs = require("fs");
const { join } = require("path");
const assert = require("assert");
const cp = require("child_process");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");

// Sets directory to output coverage data to
// Incremented every time getRunner() is called.
let covCount = 1;
const isIstanbul = process.env.running_under_istanbul;

//---------------------------------------------------//
// I/O utilities for temporary directory.
//
function temp(paths) {
  paths = Array.isArray(paths) ? paths : [paths];
  const args = [__dirname, "temp"].concat(paths);
  return join(...args);
}

function read(paths) {
  return fs.readFileSync(temp(paths), "utf8");
}

function getReadStream(paths) {
  return fs.createReadStream(temp(paths));
}

function write(paths, content) {
  return fs.writeFileSync(temp(paths), content);
}

function append(paths, content) {
  return fs.appendFileSync(temp(paths), content);
}

function unlink(paths) {
  return fs.unlinkSync(temp(paths));
}

/**
 * Gets an array containing the routine to run the pug CLI. If this file is
 * being processed with istanbul then this function will return a routine
 * asking istanbul to store coverage data to a unique directory
 * (cov-pt<covCount>/).
 */
function getRunner() {
  const pugExe = join(__dirname, "..", "index.js");

  if (!isIstanbul) return [process.argv[0], [pugExe]];
  else {
    return [
      "istanbul",
      [
        "cover",
        "--print",
        "none",
        "--report",
        "none",
        "--root",
        process.cwd(),
        "--dir",
        process.cwd() + "/cov-pt" + covCount++,
        pugExe,
        "--",
      ],
    ];
  }
}

/*
 * Run Pug CLI.
 *
 * @param  args     Array of arguments
 * @param [stdin]   Stream of standard input
 * @param  callback Function to call when the process finishes
 */
function run(args, stdin, callback) {
  if (arguments.length === 2) {
    callback = stdin;
    stdin = null;
  }
  const runner = getRunner();
  const proc = cp.execFile(
    runner[0],
    runner[1].concat(args),
    {
      cwd: temp([]),
    },
    callback
  );
  if (stdin) stdin.pipe(proc.stdin);
}

/**
 * Set timing limits for a test case
 */
function timing(testCase) {
  if (isIstanbul) {
    testCase.timeout(20000);
    testCase.slow(3000);
  } else {
    testCase.timeout(12500);
    testCase.slow(2000);
  }
}

/*
 * Make temporary directories
 */
rimraf.sync(temp([]));
mkdirp.sync(temp(["_omittedDir"]));
mkdirp.sync(temp(["dep-watch"]));
mkdirp.sync(temp(["inputs", "level-1-1"]));
mkdirp.sync(temp(["inputs", "level-1-2"]));
mkdirp.sync(temp(["outputs", "level-1-1"]));
mkdirp.sync(temp(["outputs", "level-1-2"]));

/*
 * CLI utilities
 */
describe("miscellanea", function () {
  timing(this);
  it("--version", function (done) {
    run(["-V"], function (err, stdout) {
      if (err) done(err);
      assert.equal(
        stdout.trim(),
        "pug version: " +
          require("pug/package.json").version +
          "\npug-cli version: " +
          require("../package.json").version
      );
      run(["--version"], function (err, stdout) {
        if (err) done(err);
        assert.equal(
          stdout.trim(),
          "pug version: " +
            require("pug/package.json").version +
            "\npug-cli version: " +
            require("../package.json").version
        );
        done();
      });
    });
  });
  it("--help", function (done) {
    // only check that it doesn't crash
    run(["-h"], function (err, stdout) {
      if (err) done(err);
      run(["--help"], function (err, stdout) {
        if (err) done(err);
        done();
      });
    });
  });
  it("Omits files starting with an underscore", function (done) {
    write("_omitted.pug", ".foo bar");
    write("_omitted.html", "<p>output not written</p>");

    run(["_omitted.pug"], function (err) {
      if (err) return done(err);
      const html = read("_omitted.html");
      assert(html === "<p>output not written</p>");
      done();
    });
  });
  it("Omits directories starting with an underscore", function (done) {
    write("_omittedDir/file.pug", ".foo bar");
    write("_omittedDir/file.html", "<p>output not written</p>");

    run(["--no-debug", "_omittedDir/file.pug"], function (err, stdout) {
      if (err) return done(err);
      const html = read("_omittedDir/file.html");
      assert.equal(html, "<p>output not written</p>");
      done();
    });
  });
});

describe("HTML output", function () {
  timing(this);
  it("works", function (done) {
    write("input.pug", ".foo bar");
    write("input.html", "<p>output not written</p>");

    run(["--no-debug", "input.pug"], function (err) {
      if (err) return done(err);
      const html = read("input.html");
      assert(html === '<div class="foo">bar</div>');
      done();
    });
  });
  it("--extension", function (done) {
    write("input.pug", ".foo bar");
    write("input.special-html", "<p>output not written</p>");

    run(["--no-debug", "-E", "special-html", "input.pug"], function (err) {
      if (err) return done(err);
      const html = read("input.special-html");
      assert(html === '<div class="foo">bar</div>');
      done();
    });
  });
  it("--basedir", function (done) {
    write("input.pug", "extends /dependency1.pug");
    write("input.html", "<p>output not written</p>");
    run(
      ["--no-debug", "-b", join(__dirname, "dependencies"), "input.pug"],
      function (err, stdout) {
        if (err) return done(err);
        const html = read("input.html");
        assert.equal(html, "<html><body></body></html>");
        done();
      }
    );
  });
  context("--obj", function () {
    it("JavaScript syntax works", function (done) {
      write("input.pug", ".foo= loc");
      write("input.html", "<p>output not written</p>");
      run(
        ["--no-debug", "--obj", "{'loc':'str'}", "input.pug"],
        function (err) {
          if (err) return done(err);
          const html = read("input.html");
          assert(html === '<div class="foo">str</div>');
          done();
        }
      );
    });
    it("JSON syntax accept UTF newlines", function (done) {
      write("input.pug", ".foo= loc");
      write("input.html", "<p>output not written</p>");
      run(
        ["--no-debug", "--obj", '{"loc":"st\u2028r"}', "input.pug"],
        function (err) {
          if (err) return done(err);
          const html = read("input.html");
          assert.equal(html, '<div class="foo">st\u2028r</div>');
          done();
        }
      );
    });

    it("JSON file", function (done) {
      write("obj.json", '{"loc":"str"}');
      write("input.pug", ".foo= loc");
      write("input.html", "<p>output not written</p>");
      run(["--no-debug", "--obj", "obj.json", "input.pug"], function (err) {
        if (err) return done(err);
        const html = read("input.html");
        assert(html === '<div class="foo">str</div>');
        done();
      });
    });

    it("JavaScript module", function (done) {
      write("obj.js", 'module.exports = {loc: "str"};');
      write("input.pug", ".foo= loc");
      write("input.html", "<p>output not written</p>");

      run(["--no-debug", "--obj", "obj.js", "input.pug"], function (err) {
        if (err) return done(err);
        const html = read("input.html");
        assert(html === '<div class="foo">str</div>');
        done();
      });
    });
  });

  it("stdio", function (done) {
    write("input.pug", ".foo bar");
    run(
      ["--no-debug"],
      getReadStream("input.pug"),
      function (err, stdout, stderr) {
        if (err) return done(err);
        assert(stdout === '<div class="foo">bar</div>');
        done();
      }
    );
  });
  context("--out", function () {
    it("works", function (done) {
      write("input.pug", ".foo bar");
      write("input.html", "<p>output not written</p>");
      run(["--no-debug", "--out", "outputs", "input.pug"], function (err) {
        if (err) return done(err);
        const html = read(["outputs", "input.html"]);
        assert(html === '<div class="foo">bar</div>');
        done();
      });
    });
    it("works when input is a directory", function (done) {
      write(["inputs", "input.pug"], ".foo bar 1");
      write(["inputs", "level-1-1", "input.pug"], ".foo bar 1-1");
      write(["inputs", "level-1-2", "input.pug"], ".foo bar 1-2");
      write(["outputs", "input.html"], "BIG FAT HEN 1");
      write(["outputs", "level-1-1", "input.html"], "BIG FAT HEN 1-1");
      write(["outputs", "level-1-2", "input.html"], "BIG FAT HEN 1-2");

      run(["--no-debug", "--out", "outputs", "inputs"], function (err) {
        if (err) return done(err);
        let html = read(["outputs", "input.html"]);
        assert(html === '<div class="foo">bar 1</div>');
        html = read(["outputs", "level-1-1", "input.html"]);
        assert(html === '<div class="foo">bar 1-1</div>');
        html = read(["outputs", "level-1-2", "input.html"]);
        assert(html === '<div class="foo">bar 1-2</div>');
        done();
      });
    });
  });
  it("--silent", function (done) {
    write("input.pug", ".foo bar");
    write("input.html", "<p>output not written</p>");
    run(["--no-debug", "-s", "input.pug"], function (err, stdout) {
      if (err) return done(err);
      const html = read("input.html");
      assert.equal(html, '<div class="foo">bar</div>');
      assert.equal(stdout, "");

      write("input.html", "<p>output not written</p>");
      run(["--no-debug", "--silent", "input.pug"], function (err, stdout) {
        if (err) return done(err);
        const html = read("input.html");
        assert.equal(html, '<div class="foo">bar</div>');
        assert.equal(stdout, "");
        done();
      });
    });
  });
});

describe("client JavaScript output", function () {
  timing(this);
  it("works", function (done) {
    write("input.pug", ".foo bar");
    write("input.js", 'throw new Error("output not written");');
    run(["--no-debug", "--client", "input.pug"], function (err) {
      if (err) return done(err);
      const template = Function("", read("input.js") + ";return template;")();
      assert(template() === '<div class="foo">bar</div>');
      done();
    });
  });
  it("--name", function (done) {
    write("input.pug", ".foo bar");
    write("input.js", 'throw new Error("output not written");');
    run(
      ["--no-debug", "--client", "--name", "myTemplate", "input.pug"],
      function (err) {
        if (err) return done(err);
        const template = Function(
          "",
          read("input.js") + ";return myTemplate;"
        )();
        assert(template() === '<div class="foo">bar</div>');
        done();
      }
    );
  });
  it("--name --extension", function (done) {
    write("input.pug", ".foo bar");
    write("input.special-js", 'throw new Error("output not written");');
    run(
      ["--no-debug", "--client", "-E", "special-js", "input.pug"],
      function (err) {
        if (err) return done(err);
        const template = Function(
          "",
          read("input.special-js") + ";return template;"
        )();
        assert(template() === '<div class="foo">bar</div>');
        done();
      }
    );
  });
  it("stdio", function (done) {
    write("input.pug", ".foo bar");
    write("input.js", 'throw new Error("output not written");');
    run(
      ["--no-debug", "--client"],
      getReadStream("input.pug"),
      function (err, stdout) {
        if (err) return done(err);
        const template = Function("", stdout + ";return template;")();
        assert(template() === '<div class="foo">bar</div>');
        done();
      }
    );
  });
  it("--name-after-file", function (done) {
    write("input-file.pug", ".foo bar");
    write("input-file.js", 'throw new Error("output not written");');
    run(
      ["--no-debug", "--client", "--name-after-file", "input-file.pug"],
      function (err, stdout, stderr) {
        if (err) return done(err);
        const template = Function(
          "",
          read("input-file.js") + ";return inputFileTemplate;"
        )();
        assert(template() === '<div class="foo">bar</div>');
        return done();
      }
    );
  });
  it("--name-after-file ·InPuTwIthWEiRdNaMME.pug", function (done) {
    write("·InPuTwIthWEiRdNaMME.pug", ".foo bar");
    write("·InPuTwIthWEiRdNaMME.js", 'throw new Error("output not written");');
    run(
      [
        "--no-debug",
        "--client",
        "--name-after-file",
        "·InPuTwIthWEiRdNaMME.pug",
      ],
      function (err, stdout, stderr) {
        if (err) return done(err);
        const template = Function(
          "",
          read("·InPuTwIthWEiRdNaMME.js") +
            ";return InputwithweirdnammeTemplate;"
        )();
        assert(template() === '<div class="foo">bar</div>');
        return done();
      }
    );
  });
});

describe("--watch", function () {
  let watchProc;
  let stdout = "";

  function cleanup() {
    stdout = "";
    if (!watchProc) return;

    watchProc.stderr.removeAllListeners("data");
    watchProc.stdout.removeAllListeners("data");
    watchProc.removeAllListeners("error");
    watchProc.removeAllListeners("close");
  }

  before(function () {
    const cmd = getRunner();
    cmd[1].push(
      // "--no-debug",
      "--client",
      "--name-after-file",
      "--watch",
      "input-file.pug"
    );
    watchProc = cp.spawn(cmd[0], cmd[1], {
      cwd: temp([]),
    });
  });

  after(function () {
    cleanup();
    watchProc.kill("SIGINT");
    watchProc = null;
  });

  beforeEach(cleanup);

  afterEach(function (done) {
    // pug --watch can only detect changes that are at least 1 second apart
    setTimeout(done, 1000);
  });

  it("pass 1: initial compilation", function (done) {
    timing(this);

    write("input-file.pug", ".foo bar");
    write("input-file.js", 'throw new Error("output not written (pass 1)");');

    watchProc.stdout.setEncoding("utf8");
    watchProc.stderr.setEncoding("utf8");
    watchProc.on("error", done);
    watchProc.stdout.on("data", function (buf) {
      stdout += buf;

      if (/rendered/.test(stdout)) {
        cleanup();

        const template = Function(
          "",
          read("input-file.js") + ";return inputFileTemplate;"
        )();
        assert(template() === '<div class="foo">bar</div>');

        return done();
      }
    });
  });

  it("pass 2: change the file", function (done) {
    write("input-file.js", 'throw new Error("output not written (pass 2)");');

    watchProc.on("error", done);
    watchProc.stdout.on("data", function (buf) {
      stdout += buf;

      if (/rendered/.test(stdout)) {
        cleanup();

        const template = Function(
          "",
          read("input-file.js") + ";return inputFileTemplate;"
        )();
        assert(template() === '<div class="foo">baz</div>');

        return done();
      }
    });

    write("input-file.pug", ".foo baz");
  });

  it("pass 3: remove the file then add it back", function (done) {
    write("input-file.js", 'throw new Error("output not written (pass 3)");');

    watchProc.on("error", done);
    watchProc.stdout.on("data", function (buf) {
      stdout += buf;
      if (/rendered/.test(stdout)) {
        cleanup();

        const template = Function(
          "",
          read("input-file.js") + ";return inputFileTemplate;"
        )();
        assert(template() === '<div class="foo">bat</div>');

        return done();
      }
    });

    unlink("input-file.pug");
    setTimeout(function () {
      write("input-file.pug", ".foo bat");
    }, 250);
  });

  it("pass 4: intentional errors in the pug file", function (done) {
    let stderr = "";
    let errored = false;

    watchProc.on("error", done);
    watchProc.on("close", function () {
      errored = true;
      return done(new Error("Pug should not terminate in watch mode"));
    });
    watchProc.stdout.on("data", function (buf) {
      stdout += buf;
      if (/rendered/.test(stdout)) {
        stdout = "";
        return done(new Error("Pug compiles an erroneous file w/o error"));
      }
    });
    watchProc.stderr.on("data", function (buf) {
      stderr += buf;
      if (!/Invalid indentation/.test(stderr)) return;
      stderr = "";
      const template = Function(
        "",
        read("input-file.js") + ";return inputFileTemplate;"
      )();
      assert(template() === '<div class="foo">bat</div>');

      watchProc.stderr.removeAllListeners("data");
      watchProc.stdout.removeAllListeners("data");
      watchProc.removeAllListeners("error");
      watchProc.removeAllListeners("exit");
      // The stderr event will always fire sooner than the close event.
      // Wait for it.
      setTimeout(function () {
        if (!errored) done();
      }, 100);
    });

    write("input-file.pug", ["div", "  div", "\tarticle"].join("\n"));
  });
});

describe("--watch with dependencies", function () {
  let watchProc;
  let stdout = "";

  before(function () {
    function copy(file) {
      write(
        ["dep-watch", file],
        fs.readFileSync(join(__dirname, "dependencies", file))
      );
    }
    copy("include2.pug");
    copy("dependency2.pug");
    copy("dependency3.pug");
  });

  function cleanup() {
    stdout = "";

    if (!watchProc) return;

    watchProc.stderr.removeAllListeners("data");
    watchProc.stdout.removeAllListeners("data");
    watchProc.removeAllListeners("error");
    watchProc.removeAllListeners("close");
  }

  after(function () {
    cleanup();
    watchProc.kill("SIGINT");
    watchProc = null;
  });

  beforeEach(cleanup);

  afterEach(function (done) {
    // pug --watch can only detect changes that are at least 1 second apart
    setTimeout(done, 1000);
  });

  it("pass 1: initial compilation", function (done) {
    timing(this);

    write(
      ["dep-watch", "include2.html"],
      "output not written to include2.html (pass 1)"
    );
    write(
      ["dep-watch", "dependency2.html"],
      "output not written to dependency2.html (pass 1)"
    );
    var cmd = getRunner();
    cmd[1].push("--watch", "include2.pug", "dependency2.pug");
    watchProc = cp.spawn(cmd[0], cmd[1], {
      cwd: temp("dep-watch"),
    });

    watchProc.stdout.setEncoding("utf8");
    watchProc.stderr.setEncoding("utf8");

    watchProc.on("error", done);

    watchProc.stdout.on("data", function (buf) {
      stdout += buf;

      if ((stdout.match(/rendered/g) || []).length === 2) {
        cleanup();

        let output = "";

        output = read(["dep-watch", "dependency2.html"]);
        assert.equal(output.trim(), "<strong>dependency3</strong>");

        output = read(["dep-watch", "include2.html"]);
        assert.equal(output.trim(), "<strong>dependency3</strong>");

        return done();
      }
    });
  });

  it("pass 2: change a dependency", function (done) {
    timing(this);

    write(
      ["dep-watch", "include2.html"],
      "output not written to include2.html (pass 2)"
    );
    write(
      ["dep-watch", "dependency2.html"],
      "output not written to dependency2.html (pass 2)"
    );

    watchProc.on("error", done);

    watchProc.stdout.on("data", function (buf) {
      stdout += buf;

      if ((stdout.match(/rendered/g) || []).length === 2) {
        cleanup();

        let output = "";

        output = read(["dep-watch", "dependency2.html"]);
        assert.equal(output.trim(), "<strong>dependency3</strong><p>Hey</p>");

        output = read(["dep-watch", "include2.html"]);
        assert.equal(output.trim(), "<strong>dependency3</strong><p>Hey</p>");

        return done();
      }
    });

    append(["dep-watch", "dependency2.pug"], "\np Hey\n");
  });

  it("pass 3: change a deeper dependency", function (done) {
    timing(this);

    write(["dep-watch", "include2.html"], "output not written (pass 3)");
    write(["dep-watch", "dependency2.html"], "output not written (pass 3)");

    watchProc.on("error", done);
    watchProc.stdout.on("data", function (buf) {
      stdout += buf;

      if ((stdout.match(/rendered/g) || []).length === 2) {
        cleanup();

        let output = read(["dep-watch", "include2.html"]);
        assert.equal(
          output.trim(),
          "<strong>dependency3</strong><p>Foo</p><p>Hey</p>"
        );
        output = read(["dep-watch", "dependency2.html"]);
        assert.equal(
          output.trim(),
          "<strong>dependency3</strong><p>Foo</p><p>Hey</p>"
        );

        return done();
      }
    });

    append(["dep-watch", "dependency3.pug"], "\np Foo\n");
  });

  it("pass 4: change main file", function (done) {
    timing(this);

    write(["dep-watch", "include2.html"], "output not written (pass 4)");
    write(["dep-watch", "dependency2.html"], "output not written (pass 4)");

    watchProc.on("error", done);

    watchProc.stdout.on("data", function (buf) {
      stdout += buf;
      if ((stdout.match(/rendered/g) || []).length === 1) {
        cleanup();

        let output = read(["dep-watch", "include2.html"]);
        assert.equal(
          output.trim(),
          "<strong>dependency3</strong><p>Foo</p><p>Hey</p><p>Baz</p>"
        );
        output = read(["dep-watch", "dependency2.html"]);
        assert.equal(output.trim(), "output not written (pass 4)");

        return done();
      }
    });

    append(["dep-watch", "include2.pug"], "\np Baz\n");
  });
});
