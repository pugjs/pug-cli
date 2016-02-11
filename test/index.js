'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var cp = require('child_process');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');

// Sets directory to output coverage data to
// Incremented every time getRunner() is called.
var covCount = 1;
var isIstanbul = process.env.running_under_istanbul;

/**
 * Gets an array containing the routine to run the pug CLI. If this file is
 * being processed with istanbul then this function will return a routine
 * asking istanbul to store coverage data to a unique directory
 * (cov-pt<covCount>/).
 */
function getRunner() {
  var pugExe = __dirname + '/../index.js';

  if (!isIstanbul) return ['node', [pugExe]];
  else {
    return [ 'istanbul',
             [ 'cover',
               '--print',  'none',
               '--report', 'none',
               '--root',   process.cwd(),
               '--dir',    process.cwd() + '/cov-pt' + (covCount++),
               pugExe,
               '--' ] ];
  }
}

function run(args, stdin, callback) {
  if (arguments.length === 2) {
    callback = stdin;
    stdin    = null;
  }
  var runner = getRunner();
  var proc = cp.execFile(runner[0], runner[1].concat(args), {
    cwd: __dirname + '/temp'
  }, callback);
  if (stdin) stdin.pipe(proc.stdin);
}

rimraf.sync(__dirname + '/temp');
mkdirp.sync(__dirname + '/temp/depwatch');
mkdirp.sync(__dirname + '/temp/inputs/level-1-1');
mkdirp.sync(__dirname + '/temp/inputs/level-1-2');
mkdirp.sync(__dirname + '/temp/outputs/level-1-1');
mkdirp.sync(__dirname + '/temp/outputs/level-1-2');
mkdirp.sync(__dirname + '/temp/mixins');

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

describe('command line', function () {
  timing(this);
  it('pug --version', function (done) {
    run(['-V'], function (err, stdout) {
      if (err) done(err);
      assert.equal(stdout.trim(), 'pug version: ' + require('jade/package.json').version + '\npug-cli version: ' + require('../package.json').version);
      run(['--version'], function (err, stdout) {
        if (err) done(err);
        assert.equal(stdout.trim(), 'pug version: ' + require('jade/package.json').version + '\npug-cli version: ' + require('../package.json').version);
        done()
      });
    });
  });
  it('pug --help', function (done) {
    // only check that it doesn't crash
    run(['-h'], function (err, stdout) {
      if (err) done(err);
      run(['--help'], function (err, stdout) {
        if (err) done(err);
        done()
      });
    });
  });
});

describe('command line with HTML output', function () {
  timing(this);
  it('pug --no-debug input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert(html === '<div class="foo">bar</div>');
      done();
    });
  });
  it('pug --no-debug -E special-html input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.special-html', '<p>output not written</p>');
    run(['--no-debug', '-E', 'special-html', 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.special-html', 'utf8');
      assert(html === '<div class="foo">bar</div>');
      done();
    });
  });
  it('pug --no-debug --obj "{\'loc\':\'str\'}" input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo= loc');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '--obj', "{'loc':'str'}", 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert(html === '<div class="foo">str</div>');
      done();
    });
  });
  it("UTF newlines do not work in non-JSON object", function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo= loc');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '--obj', "{'loc':'st\u2028r'}", 'input.pug'], function (err) {
      if (!err) return done(new Error('expecting error'));
      done();
    });
  });
  it("UTF newlines work in a JSON object", function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo= loc');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '--obj', '{"loc":"st\u2028r"}', 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert.equal(html, '<div class="foo">st\u2028r</div>');
      done();
    });
  });
  it('pug --no-debug --obj "obj.json" input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/obj.json', '{"loc":"str"}');
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo= loc');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '--obj', __dirname+'/temp/obj.json', 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert(html === '<div class="foo">str</div>');
      done();
    });
  });
  it('cat input.pug | pug --no-debug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    run(['--no-debug'], fs.createReadStream(__dirname + '/temp/input.pug'), function (err, stdout, stderr) {
      if (err) return done(err);
      assert(stdout === '<div class="foo">bar</div>');
      done();
    });
  });
  it('pug --no-debug --out outputs input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '--out', 'outputs', 'input.pug'], function (err) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/outputs/input.html', 'utf8');
      assert(html === '<div class="foo">bar</div>');
      done();
    });
  });
  context('when input is directory', function () {
    it('pug --no-debug --out outputs inputs', function (done) {
      fs.writeFileSync(__dirname + '/temp/inputs/input.pug', '.foo bar 1');
      fs.writeFileSync(__dirname + '/temp/inputs/level-1-1/input.pug', '.foo bar 1-1');
      fs.writeFileSync(__dirname + '/temp/inputs/level-1-2/input.pug', '.foo bar 1-2');
      fs.writeFileSync(__dirname + '/temp/outputs/input.html', 'BIG FAT HEN 1');
      fs.writeFileSync(__dirname + '/temp/outputs/level-1-1/input.html', 'BIG FAT HEN 1-1');
      fs.writeFileSync(__dirname + '/temp/outputs/level-1-2/input.html', 'BIG FAT HEN 1-2');
      run(['--no-debug', '--hierarchy', '--out', 'outputs', 'inputs'], function (err) {
        if (err) return done(err);
        var html = fs.readFileSync(__dirname + '/temp/outputs/input.html', 'utf8');
        assert(html === '<div class="foo">bar 1</div>');
        var html = fs.readFileSync(__dirname + '/temp/outputs/level-1-1/input.html', 'utf8');
        assert(html === '<div class="foo">bar 1-1</div>');
        var html = fs.readFileSync(__dirname + '/temp/outputs/level-1-2/input.html', 'utf8');
        assert(html === '<div class="foo">bar 1-2</div>');
        done();
      });
    });
  });
  it('pug --no-debug --silent input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
    run(['--no-debug', '-s', 'input.pug'], function (err, stdout) {
      if (err) return done(err);
      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert.equal(html, '<div class="foo">bar</div>');
      assert.equal(stdout, '');

      fs.writeFileSync(__dirname + '/temp/input.html', '<p>output not written</p>');
      run(['--no-debug', '--silent', 'input.pug'], function (err, stdout) {
        if (err) return done(err);
        var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
        assert.equal(html, '<div class="foo">bar</div>');
        assert.equal(stdout, '');
        done();
      });
    });
  });
  it.only('pug --basedir mixins/ input.pug', function (done)
  {
    /* TODO: cannot use .pug extenstion for mixins, rendered as plain text */
    fs.writeFileSync(__dirname + '/temp/mixins/Mixin.jade', 'mixin Mixin\n  div mixin');
    fs.writeFileSync(__dirname + '/temp/input.pug', 'include /mixins/Mixin\n+Mixin');
    run(['--no-debug', '-s', '--basedir', './', 'input.pug'], function (err, stdout)
    {
      if (err) return done(err);

      var html = fs.readFileSync(__dirname + '/temp/input.html', 'utf8');
      assert.equal(html, '<div>mixin</div>');
      assert.equal(stdout, '');
      done();
    })
  });
});

describe('command line with client JS output', function () {
  timing(this);
  it('pug --no-debug --client --name myTemplate input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.js', 'throw new Error("output not written");');
    run(['--no-debug', '--client', '--name', 'myTemplate', 'input.pug'], function (err) {
      if (err) return done(err);
      var template = Function('', fs.readFileSync(__dirname + '/temp/input.js', 'utf8') + ';return myTemplate;')();
      assert(template() === '<div class="foo">bar</div>');
      done();
    });
  });
  it('pug --no-debug --client -E special-js --name myTemplate input.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.special-js', 'throw new Error("output not written");');
    run(['--no-debug', '--client', '-E', 'special-js', '--name', 'myTemplate', 'input.pug'], function (err) {
      if (err) return done(err);
      var template = Function('', fs.readFileSync(__dirname + '/temp/input.special-js', 'utf8') + ';return myTemplate;')();
      assert(template() === '<div class="foo">bar</div>');
      done();
    });
  });
  it('cat input.pug | pug --no-debug --client --name myTemplate', function (done) {
    fs.writeFileSync(__dirname + '/temp/input.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input.js', 'throw new Error("output not written");');
    run(['--no-debug', '--client', '--name', 'myTemplate'], fs.createReadStream(__dirname + '/temp/input.pug'), function (err, stdout) {
      if (err) return done(err);
      var template = Function('', stdout + ';return myTemplate;')();
      assert(template() === '<div class="foo">bar</div>');
      done();
    });
  });
  it('pug --no-debug --client --name-after-file input-file.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/input-file.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input-file.js', 'throw new Error("output not written");');
    run(['--no-debug', '--client', '--name-after-file', 'input-file.pug'], function (err, stdout, stderr) {
      if (err) return done(err);
      var template = Function('', fs.readFileSync(__dirname + '/temp/input-file.js', 'utf8') + ';return inputFileTemplate;')();
      assert(template() === '<div class="foo">bar</div>');
      return done();
    });
  });
  it('pug --no-debug --client --name-after-file _InPuTwIthWEiRdNaMME.pug', function (done) {
    fs.writeFileSync(__dirname + '/temp/_InPuTwIthWEiRdNaMME.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/_InPuTwIthWEiRdNaMME.js', 'throw new Error("output not written");');
    run(['--no-debug', '--client', '--name-after-file', '_InPuTwIthWEiRdNaMME.pug'], function (err, stdout, stderr) {
      if (err) return done(err);
      var template = Function('', fs.readFileSync(__dirname + '/temp/_InPuTwIthWEiRdNaMME.js', 'utf8') + ';return InputwithweirdnammeTemplate;')();
      assert(template() === '<div class="foo">bar</div>');
      return done();
    });
  });
});

describe('command line watch mode', function () {
  var watchProc;
  var stdout = '';
  after(function() {
    if (!watchProc) return
    // Just to be sure
    watchProc.stderr.removeAllListeners('data');
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');
    watchProc.removeAllListeners('close');

    watchProc.kill('SIGINT');
  });
  afterEach(function (done) {
    // pug --watch can only detect changes that are at least 1 second apart
    setTimeout(done, 1000);
  });
  it('pug --no-debug --client --name-after-file --watch input-file.pug (pass 1)', function (done) {
    timing(this);
    fs.writeFileSync(__dirname + '/temp/input-file.pug', '.foo bar');
    fs.writeFileSync(__dirname + '/temp/input-file.js', 'throw new Error("output not written (pass 1)");');
    var cmd = getRunner();
    cmd.push.apply(cmd,
      ['--no-debug', '--client', '--name-after-file', '--watch', 'input-file.pug']);
    watchProc = cp.spawn(cmd[0], cmd.slice(1),  {
      cwd: __dirname + '/temp'
    });

    watchProc.stdout.setEncoding('utf8');
    watchProc.stderr.setEncoding('utf8');
    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if (/.*rendered.*/.test(stdout)) {
          stdout = '';
          var template = Function('', fs.readFileSync(__dirname + '/temp/input-file.js', 'utf8') + ';return inputFileTemplate;')();
          assert(template() === '<div class="foo">bar</div>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
  });
  it('pug --no-debug --client --name-after-file --watch input-file.pug (pass 2)', function (done) {
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    fs.writeFileSync(__dirname + '/temp/input-file.js', 'throw new Error("output not written (pass 2)");');
    fs.writeFileSync(__dirname + '/temp/input-file.pug', '.foo baz');

    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if (/.*rendered.*/.test(stdout)) {
          stdout = '';
          var template = Function('', fs.readFileSync(__dirname + '/temp/input-file.js', 'utf8') + ';return inputFileTemplate;')();
          assert(template() === '<div class="foo">baz</div>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
  });
  it('pug --no-debug --client --name-after-file --watch input-file.pug (removed the file)', function (done) {
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    fs.writeFileSync(__dirname + '/temp/input-file.js', 'throw new Error("output not written (pass 3)");');
    fs.unlinkSync(__dirname + '/temp/input-file.pug');
    setTimeout(function () {
      fs.writeFileSync(__dirname + '/temp/input-file.pug', '.foo bat');
    }, 250);

    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if (/.*rendered.*/.test(stdout)) {
          stdout = '';
          var template = Function('', fs.readFileSync(__dirname + '/temp/input-file.js', 'utf8') + ';return inputFileTemplate;')();
          assert(template() === '<div class="foo">bat</div>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
  });
  it('pug --no-debug --client --name-after-file --watch input-file.pug (intentional errors in the pug file)', function (done) {
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    var stderr = '';
    var errored = false;
    watchProc
      .on('error', done)
      .on('close', function() {
        errored = true;
        return done(new Error('Pug should not terminate in watch mode'));
      })
      .stdout.on('data', function(buf) {
        stdout += buf;
        if (/.*rendered.*/.test(stdout)) {
          stdout = '';
          return done(new Error('Pug compiles an erroneous file w/o error'));
        }
      })
    watchProc
      .stderr.on('data', function(buf) {
        stderr += buf;
        if (!/.*Invalid indentation.*/.test(stderr)) return;
        stderr = '';
        var template = Function('', fs.readFileSync(__dirname + '/temp/input-file.js', 'utf8') + ';return inputFileTemplate;')();
        assert(template() === '<div class="foo">bat</div>');

        watchProc.stderr.removeAllListeners('data');
        watchProc.stdout.removeAllListeners('data');
        watchProc.removeAllListeners('error');
        watchProc.removeAllListeners('exit');
        // The stderr event will always fire sooner than the close event.
        // Wait for it.
        setTimeout(function() {
          if (!errored) done();
        }, 100);
      });
    fs.writeFileSync(__dirname + '/temp/input-file.pug', [
      'div',
      '  div',
      '\tarticle'
    ].join('\n'));
  });
});

describe('command line watch mode with dependencies', function () {
  var watchProc;
  var stdout = '';
  after(function() {
    if (!watchProc) return
    // Just to be sure
    watchProc.stderr.removeAllListeners('data');
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');
    watchProc.removeAllListeners('close');

    watchProc.kill('SIGINT');
  });
  afterEach(function (done) {
    // pug --watch can only detect changes that are at least 1 second apart
    setTimeout(done, 1000);
  });
  it('pug --watch include2.pug dependency2.pug (pass 1)', function (done) {
    timing(this);
    function copy (file) {
      fs.writeFileSync(__dirname + '/temp/depwatch/' + file,
        fs.readFileSync(__dirname + '/dependencies/' + file));
    }
    copy('include2.pug');
    copy('dependency2.pug');
    copy('dependency3.pug');
    fs.writeFileSync(__dirname + '/temp/depwatch/include2.html',    'output not written (pass 1)');
    fs.writeFileSync(__dirname + '/temp/depwatch/dependency2.html', 'output not written (pass 1)');
    var cmd = getRunner();
    cmd.push('--watch', 'include2.pug', 'dependency2.pug');
    watchProc = cp.spawn(cmd[0], cmd.slice(1),  {
      cwd: __dirname + '/temp/depwatch'
    });

    watchProc.stdout.setEncoding('utf8');
    watchProc.stderr.setEncoding('utf8');
    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if ((stdout.match(/rendered/g) || []).length === 2) {
          stdout = '';

          var output = fs.readFileSync(__dirname + '/temp/depwatch/include2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong>');
          output = fs.readFileSync(__dirname + '/temp/depwatch/dependency2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
  });
  it('pug --watch include2.pug dependency2.pug (pass 2)', function (done) {
    timing(this);
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    fs.writeFileSync(__dirname + '/temp/depwatch/include2.html',    'output not written (pass 2)');
    fs.writeFileSync(__dirname + '/temp/depwatch/dependency2.html', 'output not written (pass 2)');

    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if ((stdout.match(/rendered/g) || []).length === 2) {
          stdout = '';

          var output = fs.readFileSync(__dirname + '/temp/depwatch/include2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong><p>Hey</p>');
          output = fs.readFileSync(__dirname + '/temp/depwatch/dependency2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong><p>Hey</p>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
    fs.appendFileSync(__dirname + '/temp/depwatch/dependency2.pug', '\np Hey\n');
  });
  it('pug --watch include2.pug dependency2.pug (pass 3)', function (done) {
    timing(this);
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    fs.writeFileSync(__dirname + '/temp/depwatch/include2.html',    'output not written (pass 3)');
    fs.writeFileSync(__dirname + '/temp/depwatch/dependency2.html', 'output not written (pass 3)');

    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if ((stdout.match(/rendered/g) || []).length === 2) {
          stdout = '';

          var output = fs.readFileSync(__dirname + '/temp/depwatch/include2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong><p>Foo</p><p>Hey</p>');
          output = fs.readFileSync(__dirname + '/temp/depwatch/dependency2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong><p>Foo</p><p>Hey</p>');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
    fs.appendFileSync(__dirname + '/temp/depwatch/dependency3.pug', '\np Foo\n');
  });
  it('pug --watch include2.pug dependency2.pug (pass 4)', function (done) {
    timing(this);
    // Just to be sure
    watchProc.stdout.removeAllListeners('data');
    watchProc.removeAllListeners('error');

    fs.writeFileSync(__dirname + '/temp/depwatch/include2.html',    'output not written (pass 4)');
    fs.writeFileSync(__dirname + '/temp/depwatch/dependency2.html', 'output not written (pass 4)');

    watchProc
      .on('error', done)
      .stdout.on('data', function(buf) {
        stdout += buf;
        if ((stdout.match(/rendered/g) || []).length === 1) {
          stdout = '';

          var output = fs.readFileSync(__dirname + '/temp/depwatch/include2.html', 'utf8');
          assert.equal(output.trim(), '<strong>dependency3</strong><p>Foo</p><p>Hey</p><p>Baz</p>');
          output = fs.readFileSync(__dirname + '/temp/depwatch/dependency2.html', 'utf8');
          assert.equal(output.trim(), 'output not written (pass 4)');

          watchProc.stdout.removeAllListeners('data');
          watchProc.removeAllListeners('error');
          return done();
        }
      });
    fs.appendFileSync(__dirname + '/temp/depwatch/include2.pug', '\np Baz\n');
  });
});
