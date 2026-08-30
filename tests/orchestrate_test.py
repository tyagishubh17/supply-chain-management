import subprocess
import sys
import time
import urllib.request

BACKEND_DIR = "/home/claude/backend"
FRONTEND_DIR = "/home/claude/frontend"


def wait_for(url, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def main():
    procs = []
    try:
        backend = subprocess.Popen(
            ["./venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
            cwd=BACKEND_DIR,
            stdout=open(f"{BACKEND_DIR}/server.log", "w"),
            stderr=subprocess.STDOUT,
        )
        procs.append(backend)

        frontend = subprocess.Popen(
            ["npx", "serve", "-s", "dist", "-l", "5173"],
            cwd=FRONTEND_DIR,
            stdout=open(f"{FRONTEND_DIR}/serve.log", "w"),
            stderr=subprocess.STDOUT,
        )
        procs.append(frontend)

        ok_backend = wait_for("http://localhost:8000/")
        ok_frontend = wait_for("http://localhost:5173/")
        print(f"backend ready: {ok_backend}, frontend ready: {ok_frontend}", flush=True)

        if not (ok_backend and ok_frontend):
            print("Services did not start in time, aborting UI test", flush=True)
            return 1

        # Run the actual Playwright test as a subprocess so a hang there
        # doesn't take down this orchestrator's own cleanup logic.
        result = subprocess.run(
            [sys.executable, "-u", "/home/claude/ui_test.py"],
            timeout=45,
            capture_output=True,
            text=True,
        )
        print("=== UI TEST STDOUT ===", flush=True)
        print(result.stdout, flush=True)
        print("=== UI TEST STDERR ===", flush=True)
        print(result.stderr, flush=True)
        return result.returncode

    except subprocess.TimeoutExpired as e:
        print("UI test subprocess timed out", flush=True)
        print("partial stdout:", e.stdout, flush=True)
        return 1
    finally:
        for p in procs:
            p.terminate()
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        print("cleanup done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
