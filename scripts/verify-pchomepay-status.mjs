// 不需網路：node --test scripts/verify-pchomepay-status.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { classifyPchomepayQuery as c } from "../lib/pchomepay-status.ts";

test("status=S 且 status_code=null → 已付款", () => {
  assert.equal(c({ status: "S", status_code: null }), "paid");
  assert.equal(c({ status: "S" }), "paid");
});
test("status=P → 未付/處理中", () => {
  assert.equal(c({ status: "P", status_code: null }), "pending");
});
test("status=F 或 status_code=F → 失敗", () => {
  assert.equal(c({ status: "F" }), "failed");
  assert.equal(c({ status_code: "F" }), "failed");
});
test("舊格式 status_code=S/00/1 → 仍視為已付款", () => {
  for (const code of ["S", "00", "1"]) assert.equal(c({ status_code: code }), "paid");
});
test("無法辨識 → 未付", () => {
  assert.equal(c({}), "pending");
  assert.equal(c({ status: "X", status_code: "99" }), "pending");
});
