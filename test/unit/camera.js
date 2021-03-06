'use strict';

require('../common/bootstrap');

exports['av.Camera'] = {
  setUp(done) {
    this.emitter = new Emitter();
    this.spawn = sandbox.stub(cp, 'spawn').callsFake(() => {
      this.emitter = new Emitter();
      this.emitter.kill = sandbox.stub();
      this.emitter.stderr = new Emitter();
      this.emitter.stdout = new Emitter();
      return this.emitter;
    });

    this.wmSet = sandbox.spy(WeakMap.prototype, 'set');
    this.write = sandbox.stub(Writable.prototype, 'write');

    done();
  },

  tearDown(done) {
    sandbox.restore();
    done();
  },

  basic(test) {
    test.expect(1);
    test.equal(typeof av.Camera, 'function');
    test.done();
  },

  emitter(test) {
    test.expect(1);
    test.equal((new av.Camera()) instanceof Emitter, true);
    test.done();
  },

  capture(test) {
    test.expect(1);
    test.equal(typeof av.Camera.prototype.capture, 'function');
    test.done();
  },

  optionsAreString(test) {
    test.expect(1);

    const url = 'http://127.0.0.1:3000/?action=stream';
    const cam = new av.Camera(url);

    test.equal(cam.url, url);
    test.done();
  },

  optionsHaveDimensionsString(test) {
    test.expect(2);

    const options = {
      dimensions: '320x240',
    };
    const cam = new av.Camera(options);
    test.equal(cam.dimensions, options.dimensions);
    test.equal(this.wmSet.lastCall.args[1].mjpg.dimensions, options.dimensions);
    test.done();
  },

  optionsHaveWidthHeight(test) {
    test.expect(2);

    const options = {
      width: 320,
      height: 240,
    };
    const cam = new av.Camera(options);

    test.equal(cam.dimensions, '320x240');
    test.equal(this.wmSet.lastCall.args[1].mjpg.dimensions, '320x240');
    test.done();
  },

  optionsHaveFPS(test) {
    test.expect(1);

    const options = {
      fps: 1000,
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].mjpg.fps, options.fps);
    test.done();
  },

  optionsHaveQuality(test) {
    test.expect(1);

    const options = {
      quality: 100,
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].mjpg.quality, options.quality);
    test.done();
  },

  optionsHavePort(test) {
    test.expect(1);

    const options = {
      port: 1337,
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].mjpg.port, options.port);
    test.done();
  },

  optionsHaveDevice(test) {
    test.expect(1);

    const options = {
      device: '/dev/video1',
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].mjpg.device, options.device);
    test.done();
  },

  optionsHaveTimeout(test) {
    test.expect(1);

    const options = {
      timeout: 1,
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].remote.timeout, options.timeout);
    test.done();
  },

  optionsHaveUrl(test) {
    test.expect(1);

    const url = 'http://127.0.0.1:3000/?action=stream';
    const options = {
      url,
    };
    const cam = new av.Camera(options);

    test.equal(this.wmSet.lastCall.args[1].remote.url, options.url);
    test.done();
  },

  captureReadable(test) {
    test.expect(2);

    const cam = new av.Camera();
    const capture = cam.capture();

    test.equal(capture instanceof CaptureStream, true);
    test.equal(capture instanceof Readable, true);

    test.done();
  },

  captureToPipe(test) {
    test.expect(5);

    const buffer = new Buffer([0]);
    const cam = new av.Camera();
    const writable = new Writable();

    writable.on('pipe', () => {
      test.ok(true);
    });

    cam.capture().pipe(writable).on('finish', () => {
      test.ok(true);
    });

    cam.on('stop', () => {
      test.ok(this.write.lastCall.args[0].equals(buffer));
      test.equal(this.write.callCount, 1);
      // This is null because we bypassed the frame setting
      // mechanism below when `cam.emit('data', buffer);`
      // is called. That's _not_ true of actual behavior.
      test.equal(cam.frame, null);
      test.done();
    });

    cam.emit('data', buffer);
  },

  captureMultiple(test) {
    test.expect(8);

    const buffer = new Buffer([0]);
    const cam = new av.Camera();
    const writable = new Writable();

    sandbox.spy(cam, 'capture');
    sandbox.spy(cam, 'stream');

    cam.on('stop', () => {
      test.ok(buffer.equals(buffer));
      buffer.writeInt8(cam.capture.callCount, 0);

      if (cam.capture.callCount === 4) {
        test.equal(cam.stream.callCount, 4);
        test.done();
      } else {
        let cs = cam.capture();
        cam.emit('data', buffer);

        test.equal(cs.read(1).readUInt8(0), cam.capture.callCount - 1);

        cs.pipe(writable);
      }
    });

    cam.capture().pipe(writable);
    cam.emit('data', buffer);
  },

  spawned(test) {
    test.expect(3);

    const cam = new av.Camera();

    cam.capture();

    test.equal(this.spawn.callCount, 1);
    test.equal(this.spawn.lastCall.args[0], 'mjpg_streamer');
    test.deepEqual(this.spawn.lastCall.args[1], [
      '-i',
      '/usr/lib/input_uvc.so -n -q 100 -r 800x600 -f 30 -d /dev/video0 ',
      '-o',
      '/usr/lib/output_http.so -p 8080'
    ]);

    test.done();
  },

  stream(test) {
    test.expect(1);

    const cam = new av.Camera();

    cam.on('data', () => {
      test.ok(true);
      test.done();
    });
    cam.write(new Buffer(['a', 'b', 'c']));

  },

  streamError(test) {
    test.expect(11);

    sandbox.spy(av.Camera.prototype, 'stream');

    const streams = {
      a: new Emitter(),
      b: new Emitter(),
    };

    const cam = new av.Camera();
    const state = this.wmSet.lastCall.args[1];

    state.process = null;
    state.stream = null;

    streams.b.pipe = sandbox.stub();
    streams.a.pipe = sandbox.stub().callsFake(() => streams.b);

    sandbox.stub(got, 'stream').callsFake(() => streams.a);
    sandbox.spy(state.remote, 'start');

    test.equal(cam.stream.callCount, 1);
    test.equal(got.stream.callCount, 0);
    test.equal(state.remote.start.callCount, 0);

    cam.stream();

    // Obviously, because we just called it, but we all
    // calls to stream() accounted for.
    test.equal(cam.stream.callCount, 2);

    test.equal(state.remote.start.callCount, 1);

    test.equal(streams.a.pipe.callCount, 1);
    test.equal(streams.b.pipe.callCount, 1);

    test.equal(got.stream.callCount, 1);
    test.equal(got.stream.lastCall.args[0], state.remote.url);

    streams.a.emit('error');
    test.equal(cam.stream.callCount, 3);
    test.equal(got.stream.callCount, 2);
    test.done();
  },

  streamData(test) {
    test.expect(13);

    sandbox.spy(av.Camera.prototype, 'stream');

    const streams = {
      a: new Emitter(),
      b: new Emitter(),
    };

    const cam = new av.Camera();
    const state = this.wmSet.lastCall.args[1];

    state.process = null;
    state.stream = null;

    streams.b.pipe = sandbox.stub();
    streams.a.pipe = sandbox.stub().callsFake(() => streams.b);

    sandbox.stub(got, 'stream').callsFake(() => streams.a);
    sandbox.spy(state.remote, 'start');

    test.equal(cam.stream.callCount, 1);
    test.equal(got.stream.callCount, 0);
    test.equal(state.remote.start.callCount, 0);

    cam.stream();

    // Obviously, because we just called it, but we all
    // calls to stream() accounted for.
    test.equal(cam.stream.callCount, 2);

    test.equal(state.remote.start.callCount, 1);

    test.equal(streams.a.pipe.callCount, 1);
    test.equal(streams.b.pipe.callCount, 1);

    test.equal(got.stream.callCount, 1);
    test.equal(got.stream.lastCall.args[0], state.remote.url);

    test.equal(state.frame, null);

    streams.b.emit('data', 1);

    test.equal(state.frame, 1);

    test.equal(cam.stream.callCount, 2);
    test.equal(got.stream.callCount, 1);
    test.done();
  },

  streamDataError(test) {
    test.expect(11);

    sandbox.spy(av.Camera.prototype, 'stream');

    const streams = {
      a: new Emitter(),
      b: new Emitter(),
    };

    const cam = new av.Camera();
    const state = this.wmSet.lastCall.args[1];

    state.process = null;
    state.stream = null;

    streams.b.pipe = sandbox.stub();
    streams.a.pipe = sandbox.stub().callsFake(() => streams.b);

    sandbox.stub(got, 'stream').callsFake(() => streams.a);
    sandbox.spy(state.remote, 'start');

    test.equal(cam.stream.callCount, 1);
    test.equal(got.stream.callCount, 0);
    test.equal(state.remote.start.callCount, 0);

    cam.stream();

    // Obviously, because we just called it, but we all
    // calls to stream() accounted for.
    test.equal(cam.stream.callCount, 2);

    test.equal(state.remote.start.callCount, 1);

    test.equal(streams.a.pipe.callCount, 1);
    test.equal(streams.b.pipe.callCount, 1);

    test.equal(got.stream.callCount, 1);
    test.equal(got.stream.lastCall.args[0], state.remote.url);

    streams.b.emit('error');

    test.equal(cam.stream.callCount, 3);
    test.equal(got.stream.callCount, 2);
    test.done();
  },

};
