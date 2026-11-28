import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChannelField } from "./api.ts";
import {
  SECRET_PLACEHOLDER,
  buildConfig,
  hasStoredSecrets,
  initialValues,
  missingRequired,
  sameValues,
} from "./channels.ts";

const fields: ChannelField[] = [
  { key: "server_url", label: "Server", secret: false, required: true, default: "https://ntfy.sh" },
  { key: "topic", label: "Topic", secret: false, required: true },
  { key: "token", label: "Access token", secret: true, required: false },
  { key: "port", label: "Port", secret: false, required: false, type: "number", default: 587 },
];

test("new forms start from field defaults", () => {
  assert.deepEqual(initialValues(fields), {
    server_url: "https://ntfy.sh",
    topic: "",
    token: "",
    port: "587",
  });
});

test("edit forms start from the stored config, secrets masked", () => {
  const values = initialValues(fields, {
    config: { server_url: "https://n.lan", topic: "b", token: SECRET_PLACEHOLDER, port: 25 },
  });
  assert.equal(values.token, SECRET_PLACEHOLDER);
  assert.equal(values.port, "25");
  assert.equal(hasStoredSecrets(fields, values), true);
  assert.equal(hasStoredSecrets(fields, { ...values, token: "new" }), false);
});

test("buildConfig trims text, keeps secrets verbatim, converts numbers", () => {
  assert.deepEqual(
    buildConfig(fields, { server_url: " https://ntfy.sh ", topic: "t", token: " s ", port: "" }),
    { server_url: "https://ntfy.sh", topic: "t", token: " s " }
  );
  assert.equal(buildConfig(fields, { port: "465" }).port, 465);
});

test("missingRequired lists empty required fields", () => {
  assert.deepEqual(
    missingRequired(fields, { server_url: "x", topic: "  " }).map((f) => f.key),
    ["topic"]
  );
});

test("sameValues treats missing keys as empty", () => {
  assert.equal(sameValues({ a: "" }, {}), true);
  assert.equal(sameValues({ a: "1" }, { a: "2" }), false);
});
