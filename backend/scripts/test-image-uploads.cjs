// Run from backend/: node --import tsx scripts/test-image-uploads.cjs
// Exercise the real handlers and image processing without writing to Cloudinary.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS module-cache stubs exercise route startup failures. */
const assert = require("node:assert/strict");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const { Writable } = require("node:stream");

async function main() {
  process.env.CLOUDINARY_CLOUD_NAME = "upload-test";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  delete process.env.CLOUDINARY_URL;

  const sharp = require("sharp");
  const png = await sharp({ create: { width: 12, height: 18, channels: 4, background: "red" } }).png().toBuffer();
  const cloudinary = require("cloudinary").v2;
  const originalUpload = cloudinary.uploader.upload_stream;
  const authPath = require.resolve("../src/lib/auth");
  const originalAuth = require.cache[authPath];
  const auth = new Module(authPath);
  let isAdmin = false;
  auth.exports = { requireAdmin: async () => isAdmin ? { id: "test-admin", role: "admin" } : null };
  auth.loaded = true;
  require.cache[authPath] = auth;

  let nativeUnavailable = true;
  let storageFailure = false;
  const uploads = [];
  const warnings = [];
  const errors = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => warnings.push(args);
  console.error = (...args) => errors.push(args);
  const loaderHooks = Module.registerHooks({
    resolve(name, context, nextResolve) {
      if (name === "sharp" && nativeUnavailable) throw new Error("Could not load the sharp native module");
      return nextResolve(name, context);
    },
  });
  cloudinary.uploader.upload_stream = (options, callback) => new Writable({
    write(chunk, _encoding, done) {
      uploads.push({ options, buffer: Buffer.from(chunk) });
      done();
    },
    final(done) {
      if (storageFailure) callback({ message: "Storage temporarily unavailable", http_code: 503 });
      else callback(undefined, { secure_url: `https://res.cloudinary.com/upload-test/${options.public_id}.${options.format}` });
      done();
    },
  });

  function request(buffer = png, name = "perfume.png", type = "image/png") {
    const data = new FormData();
    data.set("file", new File([buffer], name, { type }));
    return new Request("https://example.test/api/uploads/perfume-image", { method: "POST", body: data });
  }

  try {
    const perfume = require("../src/app/api/uploads/perfume-image/route");
    const payment = require("../src/app/api/uploads/payment-qr/route");
    for (const handler of [perfume.POST, payment.POST]) {
      const response = await handler(request());
      assert.equal(response.status, 401, "Missing native modules must not crash unauthenticated requests");
    }
    assert.equal(uploads.length, 0);

    isAdmin = true;
    const fallback = await perfume.POST(request());
    assert.equal(fallback.status, 200, "Valid PNG uploads must succeed when Sharp cannot load");
    const fallbackBody = await fallback.json();
    assert.equal(fallbackBody.imageUrl, fallbackBody.fallbackUrl);
    assert.equal(fallbackBody.urls.webp, "");
    assert.deepEqual(uploads[0].buffer, png);

    const paymentFallback = await payment.POST(request());
    assert.equal(paymentFallback.status, 200);
    assert.deepEqual(uploads[1].buffer, png);

    nativeUnavailable = false;
    uploads.length = 0;
    const optimized = await perfume.POST(request());
    assert.equal(optimized.status, 200);
    const optimizedBody = await optimized.json();
    assert.match(optimizedBody.urls.webp, /\.webp$/);
    assert.match(optimizedBody.urls.png, /\.png$/);
    assert.equal(uploads.length, 2);
    for (const upload of uploads) {
      const metadata = await sharp(upload.buffer).metadata();
      assert.equal(metadata.width, 1200);
      assert.equal(metadata.height, 1200);
      assert.equal(metadata.format, upload.options.format);
    }

    uploads.length = 0;
    assert.equal((await perfume.POST(request(Buffer.from("not a PNG")))).status, 400);
    assert.equal((await perfume.POST(request(png, "perfume.jpg", "image/jpeg"))).status, 400);
    assert.equal((await perfume.POST(request(Buffer.alloc(10 * 1024 * 1024 + 1)))).status, 400);
    assert.equal(uploads.length, 0, "Invalid files must never reach storage");

    storageFailure = true;
    const warningCount = warnings.length;
    const failed = await perfume.POST(request());
    assert.equal(failed.status, 500);
    assert.equal(uploads.length, 2, "Storage failure must not trigger a third raw-image upload");
    assert.equal(warnings.length, warningCount, "Storage errors must not be reported as decoding errors");
    assert.equal((await failed.json()).error, "Storage temporarily unavailable");

    // The SDK itself throws while importing with a malformed CLOUDINARY_URL.
    // Fresh processes ensure an already-cached SDK cannot hide that startup bug.
    for (const route of ["perfume-image", "payment-qr"]) {
      const probe = spawnSync(process.execPath, ["--import", "tsx", "-e", `
        const Module = require("node:module");
        const authPath = require.resolve("./src/lib/auth");
        const auth = new Module(authPath);
        auth.exports = { requireAdmin: async () => null };
        auth.loaded = true;
        require.cache[authPath] = auth;
        const { POST } = require("./src/app/api/uploads/${route}/route");
        POST(new Request("https://example.test/api/uploads/${route}", { method: "POST" }))
          .then(response => {
            require("node:assert/strict").equal(response.status, 401);
          }).catch(error => { console.error(error); process.exitCode = 1; });
      `], {
        encoding: "utf8",
        env: { ...process.env, CLOUDINARY_URL: "malformed-cloudinary-url" },
        timeout: 15000,
      });
      assert.equal(probe.status, 0, `Malformed SDK configuration must not crash ${route}: ${probe.stderr}`);
    }
  } finally {
    loaderHooks.deregister();
    cloudinary.uploader.upload_stream = originalUpload;
    console.warn = originalWarn;
    console.error = originalError;
    if (originalAuth) require.cache[authPath] = originalAuth;
    else delete require.cache[authPath];
  }
  console.log("PASS: upload auth, SDK startup, native-module fallback, optimized PNG/WebP, validation, and storage failures");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
