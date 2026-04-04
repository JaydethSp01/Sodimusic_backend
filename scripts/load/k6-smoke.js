/**
 * k6 (instalar: https://k6.io/docs/get-started/installation/)
 * BASE_URL=http://localhost:4000 k6 run scripts/load/k6-smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.K6_VUS ?? 15),
  duration: __ENV.K6_DURATION ?? "45s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

const base = __ENV.BASE_URL ?? "http://127.0.0.1:4000";

export default function () {
  const h = http.get(`${base}/health`);
  check(h, { "health 200": (r) => r.status === 200 });
  const cfg = http.get(`${base}/api/site-config`);
  check(cfg, { "site-config 200": (r) => r.status === 200 });
  sleep(0.05);
}
