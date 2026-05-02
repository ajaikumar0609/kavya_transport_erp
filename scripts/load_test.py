"""
scripts/load_test.py
Locust load test — 10 simulated users, 60 seconds.
Validates t4g.medium handles baseline traffic without degradation.

Install: pip install locust
Run:
    locust -f scripts/load_test.py --headless \
        --host=https://kavyatransports.com \
        --users=10 \
        --spawn-rate=2 \
        --run-time=60s \
        --html=load_report.html

Or for local:
    SMOKE_TEST_URL=http://localhost:8000 locust -f scripts/load_test.py --headless \
        --host=http://localhost:8000 --users=10 --spawn-rate=2 --run-time=60s
"""
import os
import random
from locust import HttpUser, task, between, events


# ── Thresholds ────────────────────────────────────────────────
MAX_FAIL_RATE_PCT   = 1.0   # > 1% failures = test failure
MAX_P95_MS          = 2000  # > 2000ms p95 = test failure


class KavyaUser(HttpUser):
    """Simulates typical ERP user behaviour."""
    wait_time = between(1, 3)   # 1–3s between tasks

    # ── Unauthenticated / public ──────────────────────────────
    @task(5)
    def health_check(self):
        with self.client.get("/health", name="/health", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"Health check returned {r.status_code}")

    @task(2)
    def health_full(self):
        with self.client.get("/health/full", name="/health/full", catch_response=True) as r:
            if r.status_code not in (200, 503):
                r.failure(f"Unexpected status {r.status_code}")

    # ── Auth (unauthenticated attempts — expect 401) ──────────
    @task(3)
    def trips_no_auth(self):
        with self.client.get("/api/v1/trips", name="GET /trips (no-auth)", catch_response=True) as r:
            if r.status_code == 401:
                r.success()
            else:
                r.failure(f"Expected 401, got {r.status_code}")

    @task(2)
    def vehicles_no_auth(self):
        with self.client.get("/api/v1/vehicles", name="GET /vehicles (no-auth)", catch_response=True) as r:
            if r.status_code == 401:
                r.success()
            else:
                r.failure(f"Expected 401, got {r.status_code}")

    @task(1)
    def drivers_no_auth(self):
        with self.client.get("/api/v1/drivers", name="GET /drivers (no-auth)", catch_response=True) as r:
            if r.status_code == 401:
                r.success()
            else:
                r.failure(f"Expected 401, got {r.status_code}")

    # ── OTP send (expect 200 or 429 from rate limiter) ────────
    @task(1)
    def otp_send(self):
        phone = f"9{random.randint(100000000, 999999999)}"
        with self.client.post(
            "/api/v1/auth/send-otp",
            json={"phone": phone, "password": "LoadTest@123"},
            name="POST /auth/send-otp",
            catch_response=True,
        ) as r:
            if r.status_code in (200, 400, 422, 429):
                r.success()
            else:
                r.failure(f"Unexpected {r.status_code}")

    # ── Static (React SPA) ────────────────────────────────────
    @task(3)
    def spa_root(self):
        with self.client.get("/", name="GET / (SPA)", catch_response=True) as r:
            if r.status_code == 200:
                r.success()
            else:
                r.failure(f"SPA root returned {r.status_code}")


# ── Pass/fail evaluation at end of test ──────────────────────
@events.quitting.add_listener
def assert_thresholds(environment, **kwargs):
    stats = environment.runner.stats.total
    fail_rate = 100.0 * stats.num_failures / stats.num_requests if stats.num_requests else 0
    p95_ms = stats.get_response_time_percentile(0.95)

    print("\n" + "═" * 55)
    print(f"  Total requests : {stats.num_requests}")
    print(f"  Failures       : {stats.num_failures}  ({fail_rate:.2f}%)")
    print(f"  p95 latency    : {p95_ms:.0f} ms")
    print(f"  Avg latency    : {stats.avg_response_time:.0f} ms")
    print("═" * 55)

    failed = False

    if fail_rate > MAX_FAIL_RATE_PCT:
        print(f"  ❌  Failure rate {fail_rate:.2f}% > threshold {MAX_FAIL_RATE_PCT}%")
        failed = True
    else:
        print(f"  ✅  Failure rate {fail_rate:.2f}% — OK")

    if p95_ms > MAX_P95_MS:
        print(f"  ❌  p95 latency {p95_ms:.0f}ms > threshold {MAX_P95_MS}ms")
        failed = True
    else:
        print(f"  ✅  p95 latency {p95_ms:.0f}ms — OK")

    if failed:
        print("\n  ❌  LOAD TEST FAILED — t4g.medium may be under-resourced")
        environment.process_exit_code = 1
    else:
        print("\n  ✅  LOAD TEST PASSED — t4g.medium handles 10 concurrent users")
    print("═" * 55 + "\n")
