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
    state_b64 = os.getenv("KOINLY_STORAGE_STATE_B64", "")
    if not state_b64:
        raise RuntimeError("KOINLY_STORAGE_STATE_B64 is required. Provide an authenticated Playwright storage-state secret after signing in to Koinly with Google.")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        state = json.loads(base64.b64decode(state_b64).decode("utf-8"))
        context = await browser.new_context(storage_state=state)
        page = await context.new_page()

        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
        if "login" in page.url.lower():
            raise RuntimeError("The saved Google-authenticated Koinly session has expired or is invalid. Create a fresh storage state.")

        await page.goto(TX_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        if "login" in page.url.lower():
            raise RuntimeError("Koinly redirected to login; the saved Google session has expired or been revoked.")

        rows = await page.locator('table tbody tr, [role="row"]').all()
        transactions = []
        for row in rows:
            text = " ".join((await row.inner_text()).split())
            if text and len(text) > 5:
                transactions.append({"raw": text})

        payload = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "source": "Koinly Transactions page via Google-authenticated Playwright session",
            "transaction_count": len(transactions),
            "transactions": transactions,
        }
        OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
