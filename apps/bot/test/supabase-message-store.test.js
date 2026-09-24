import test from "node:test";
import assert from "node:assert/strict";

import { SupabaseMessageStore } from "../src/supabase-message-store.js";

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("modern Supabase secret key는 apikey 헤더에만 전송한다", async () => {
  let request;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      request = options;
      return response(true);
    }
  });

  await store.claimUpdate(1);
  assert.equal(request.headers.apikey, "sb_secret_test");
  assert.equal("authorization" in request.headers, false);
});

test("legacy service_role JWT는 apikey와 Bearer에 함께 전송한다", async () => {
  let request;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "legacy-jwt",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      request = options;
      return response(true);
    }
  });

  await store.claimUpdate(1);
  assert.equal(request.headers.apikey, "legacy-jwt");
  assert.equal(request.headers.authorization, "Bearer legacy-jwt");
});
