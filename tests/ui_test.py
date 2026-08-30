import random
import time
from playwright.sync_api import sync_playwright

FRONTEND = "http://localhost:5173"
suffix = random.randint(1000, 9999)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 900})
    page.set_default_timeout(8000)

    # ---- Register a vendor ----
    print("STEP: register vendor", flush=True)
    page.goto(f"{FRONTEND}/register")
    page.click("button:has-text('Vendor')")
    fields = page.locator("form .field input")
    fields.nth(0).fill(f"UI Vendor {suffix}")
    fields.nth(1).fill(f"uivendor{suffix}@test.com")
    fields.nth(2).fill("pass123")
    fields.nth(3).fill(f"UI Vendor Co {suffix}")
    fields.nth(4).fill("Bengaluru")
    page.click("button:has-text('Create account')")
    page.wait_for_url(f"{FRONTEND}/my-listings", timeout=8000)
    print("VENDOR REGISTER + REDIRECT TO MY LISTINGS: OK", flush=True)

    # ---- Vendor lists USB-C Cable at a competitive price ----
    print("STEP: vendor adds a listing", flush=True)
    page.wait_for_selector("select")
    page.select_option("select", label="USB-C Cable")
    price_inputs = page.locator(".field input[type=number]")
    price_inputs.nth(0).fill("99")
    price_inputs.nth(1).fill("2")
    page.click("button:has-text('Save listing')")
    page.wait_for_selector("text=Listing saved.")
    print("VENDOR LISTING SAVED: OK", flush=True)
    page.screenshot(path="/home/claude/screenshots/01_vendor_listing.png")

    page.click("button:has-text('Log out')")
    page.wait_for_url(f"{FRONTEND}/login")
    print("LOGOUT: OK", flush=True)

    # ---- Register an enterprise ----
    print("STEP: register enterprise", flush=True)
    page.goto(f"{FRONTEND}/register")
    page.click("button:has-text('Enterprise')")
    fields = page.locator("form .field input")
    fields.nth(0).fill(f"UI Buyer {suffix}")
    fields.nth(1).fill(f"uibuyer{suffix}@test.com")
    fields.nth(2).fill("pass123")
    fields.nth(3).fill(f"UI Buyer Co {suffix}")
    fields.nth(4).fill("Mumbai")
    page.click("button:has-text('Create account')")
    page.wait_for_url(f"{FRONTEND}/enterprise-dashboard", timeout=8000)
    print("ENTERPRISE REGISTER + REDIRECT TO DASHBOARD: OK", flush=True)
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    page.screenshot(path="/home/claude/screenshots/02b_enterprise_dashboard_empty.png")

    page.click("text=Catalog")
    page.wait_for_selector("text=Product catalog")
    page.screenshot(path="/home/claude/screenshots/02_catalog.png")

    # ---- Click a product, see vendor comparison, order from OUR new vendor ----
    page.click("td:has-text('USB-C Cable')")
    page.wait_for_selector("text=Vendors supplying")
    time.sleep(0.3)
    page.screenshot(path="/home/claude/screenshots/03_vendor_comparison.png")
    offers_text = page.locator(".panel").nth(1).inner_text()
    print("VENDOR COMPARISON PANEL TEXT:\n", offers_text, flush=True)

    page.fill("input[type=number]", "15")
    # order from the row matching the vendor we just registered (not any leftover seeded vendor)
    row = page.locator(f".vendor-compare-row:has-text('UI Vendor Co {suffix}')")
    row.locator("button:has-text('Order')").click()
    page.wait_for_selector("text=placed")
    msg = page.locator("text=placed").inner_text()
    print("ORDER PLACEMENT MESSAGE:", msg, flush=True)
    page.screenshot(path="/home/claude/screenshots/04_order_placed.png")

    # ---- Check My orders page shows it ----
    page.click("text=My orders")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("table tbody tr, .empty-state")
    time.sleep(0.3)
    print("ENTERPRISE ORDERS TABLE:\n", page.locator(".panel").inner_text(), flush=True)

    # ---- Enterprise dashboard with charts (now with real order data) ----
    print("STEP: check enterprise dashboard with data", flush=True)
    page.click("text=Overview")
    page.wait_for_selector("text=Procurement overview")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    page.screenshot(path="/home/claude/screenshots/08_enterprise_dashboard.png")
    print("ENTERPRISE DASHBOARD (WITH DATA) LOADED: OK", flush=True)

    page.click("button:has-text('Log out')")
    page.wait_for_url(f"{FRONTEND}/login")

    # ---- Vendor logs in, confirms the order via the UI button ----
    print("STEP: vendor login + confirm", flush=True)
    page.goto(f"{FRONTEND}/login")
    page.fill("input[type=email]", f"uivendor{suffix}@test.com")
    page.fill("input[type=password]", "pass123")
    page.click("button:has-text('Sign in')")
    page.wait_for_url(f"{FRONTEND}/my-listings", timeout=8000)
    page.click("text=Incoming orders")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("table tbody tr, .empty-state")
    time.sleep(0.3)
    print("VENDOR ORDERS PAGE TEXT:\n", page.locator(".panel").inner_text(), flush=True)
    page.wait_for_selector("button:has-text('Confirm')")
    page.click("button:has-text('Confirm')")
    page.wait_for_selector("text=vendor confirmed")
    print("VENDOR CONFIRM VIA UI BUTTON: OK", flush=True)
    page.screenshot(path="/home/claude/screenshots/05_vendor_confirmed.png")

    print("STEP: check vendor sales dashboard", flush=True)
    page.click("text=Sales summary")
    page.wait_for_selector("text=Sales summary")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    page.screenshot(path="/home/claude/screenshots/05b_vendor_dashboard.png")
    print("VENDOR DASHBOARD LOADED: OK", flush=True)

    page.click("button:has-text('Log out')")
    page.wait_for_url(f"{FRONTEND}/login")

    # ---- Warehouse staff registers, reserves stock via the UI button ----
    print("STEP: warehouse staff register + reserve", flush=True)
    page.goto(f"{FRONTEND}/register")
    page.click("button:has-text('Warehouse')")
    fields = page.locator("form .field input")
    fields.nth(0).fill(f"UI Warehouse {suffix}")
    fields.nth(1).fill(f"uiwarehouse{suffix}@test.com")
    fields.nth(2).fill("pass123")
    page.click("button:has-text('Create account')")
    page.wait_for_url(f"{FRONTEND}/orders", timeout=8000)
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("button:has-text('Reserve stock')")
    page.click("button:has-text('Reserve stock')")
    page.wait_for_selector("text=stock reserved")
    print("WAREHOUSE RESERVE STOCK VIA UI BUTTON: OK", flush=True)
    page.screenshot(path="/home/claude/screenshots/06_stock_reserved.png")

    # ---- Warehouse dashboard: low stock + auto-reorder + stock chart ----
    page.click("text=Warehouse")
    page.wait_for_selector("text=Low stock alerts")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    page.screenshot(path="/home/claude/screenshots/07_warehouse_dashboard.png")
    print("WAREHOUSE DASHBOARD LOADED: OK", flush=True)

    browser.close()
    print("ALL UI CHECKS PASSED", flush=True)
