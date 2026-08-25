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
        if state_b64:
            state = json.loads(base64.b64decode(state_b64).decode("utf-8"))
            context = await browser.new_context(storage_state=state)
        else:
            context = await browser.new_context()

        page = await context.new_page()
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)

        # Uses ordinary login controls only. It does not bypass MFA, CAPTCHA, or bot protection.
        if "login" in page.url.lower() and email and password:
            await page.locator('input[type="email"], input[name="email"]').first.fill(email)
            await page.locator('input[type="password"], input[name="password"]').first.fill(password)
            await page.locator('button[type="submit"], input[type="submit"]').first.click()
            await page.wait_for_timeout(3000)

        if "login" in page.url.lower():
            raise RuntimeError("Koinly authentication is still required. Use an authenticated storage-state secret when MFA is enabled.")

        await page.goto(TX_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

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
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
