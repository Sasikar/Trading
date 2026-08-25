import asyncio
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

LOGIN_URL = os.getenv("KOINLY_LOGIN_URL", "https://app.koinly.io/login")
TX_URL = os.getenv("KOINLY_TRANSACTIONS_URL", "https://app.koinly.io/transactions")
OUT = Path("artifacts/koinly-transactions.json")

async def main():
    email = os.getenv("KOINLY_EMAIL", "")
    password = os.getenv("KOINLY_PASSWORD", "")
    state_b64 = os.getenv("KOINLY_STORAGE_STATE_B64", "")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = None
        if state_b64:
            state = json.loads(base64.b64decode(state_b64).decode("utf-8"))
            context = await browser.new_context(storage_state=state)
        else:
            context = await browser.new_context()

        page = await context.new_page()
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)

        # Prefer an existing authenticated storage state. If credentials are supplied,
        # try common Koinly login controls without attempting to bypass MFA/CAPTCHA.
        if "login" in page.url.lower() and email and password:
            email_box = page.locator('input[type="email"], input[name="email"]').first
            password_box = page.locator('input[type="password"], input[name="password"]').first
            await email_box.fill(email)
            await password_box.fill(password)
            await page.locator('button[type="submit"], input[type="submit"]').first.click()
            await page.wait_for_timeout(3000)

        if "login" in page.url.lower():
            raise RuntimeError("Koinly login is still required. Use KOINLY_STORAGE_STATE_B64 for an authenticated browser session, especially when MFA is enabled.")

        await page.goto(TX_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        # Extract visible transaction rows from tables/list rows. The scraper deliberately
        # captures rendered text only; it does not attempt to defeat bot protection.
        rows = await page.locator('table tbody tr, [role="row"]').all()
        transactions = []
        for row in rows:
            text = " ".join((await row.inner_text()).split())
            if text and len(text) > 5:
                transactions.append({"raw": text})

        payload = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "source": "Koinly Transactions page",
            "transaction_count": len(transactions),
            "transactions": transactions,
        }
        OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        await context.storage_state(path="artifacts/koinly-storage-state.json")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
