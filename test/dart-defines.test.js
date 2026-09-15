"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDartDefine,
  resolveDartDefines,
  decodeDartDefinesEnv,
} = require("../src/lib/dart-defines");

describe("dart-defines", () => {
  it("parses KEY=value", () => {
    assert.deepEqual(parseDartDefine("TF_NET_PRODUCT=true"), {
      key: "TF_NET_PRODUCT",
      value: "true",
    });
    assert.deepEqual(parseDartDefine("FOO="), { key: "FOO", value: "" });
  });

  it("rejects empty or malformed specs", () => {
    assert.throws(() => parseDartDefine(""), /Empty/);
    assert.throws(() => parseDartDefine("NOEQ"), /KEY=value/);
    assert.throws(() => parseDartDefine("=x"), /KEY=value/);
  });

  it("injects TF_NET_PRODUCT from --product", () => {
    const resolved = resolveDartDefines({ product: true });
    assert.equal(resolved.product, true);
    assert.deepEqual(resolved.specs, ["TF_NET_PRODUCT=true"]);
    assert.deepEqual(resolved.flutterArgs, [
      "--dart-define=TF_NET_PRODUCT=true",
    ]);
    assert.equal(resolved.label, "PRODUCT");
  });

  it("leaves defines empty when product is off", () => {
    const resolved = resolveDartDefines({ product: false, defines: [] });
    assert.equal(resolved.product, false);
    assert.deepEqual(resolved.specs, []);
    assert.equal(resolved.label, "");
  });

  it("dedupes identical TF_NET_PRODUCT with --product", () => {
    const resolved = resolveDartDefines({
      product: true,
      defines: ["TF_NET_PRODUCT=true"],
    });
    assert.deepEqual(resolved.specs, ["TF_NET_PRODUCT=true"]);
  });

  it("errors on --product vs conflicting TF_NET_PRODUCT", () => {
    assert.throws(
      () =>
        resolveDartDefines({
          product: true,
          defines: ["TF_NET_PRODUCT=false"],
        }),
      /Conflicting dart-define for TF_NET_PRODUCT/
    );
  });

  it("errors on same key with different values", () => {
    assert.throws(
      () =>
        resolveDartDefines({
          defines: ["FOO=1", "FOO=2"],
        }),
      /Conflicting dart-define for FOO/
    );
  });

  it("keeps multiple distinct defines", () => {
    const resolved = resolveDartDefines({
      defines: ["A=1", "B=2"],
    });
    assert.deepEqual(resolved.specs, ["A=1", "B=2"]);
    assert.equal(resolved.envValue, "A=1\nB=2");
    assert.deepEqual(decodeDartDefinesEnv(resolved.envValue), ["A=1", "B=2"]);
  });
});
