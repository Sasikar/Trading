import asyncio
import base64
import json
from pathlib import Path

from playwright.async_api import async_playwright

LOGIN_URL = "https://app.koinly.io/login"
TX_URL = "https://app.koinly.io/transactions"
STATE_FILE = Path("koinly-storage-state.json")


async def main():
    print("Opening Koinly in a visible Chromium window.")
    print("Log in normally with Google/Gmail, then return here and press Enter.")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)

        await asyncio.to_thread(input, "\nAfter you are fully logged into Koinly, press Enter here: ")

        await page.goto(TX_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)
        if "login" in page.url.lower():
            raise RuntimeError("Koinly still shows the login page. Finish Google login and try again.")

        state = await context.storage_state()
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
        encoded = base64.b64encode(STATE_FILE.read_bytes()).decode("ascii")

        print("\nSUCCESS — authenticated Koinly browser state captured.")
        print("File:", STATE_FILE.resolve())
        print("\nFor GitHub Actions, store the following as the KOINLY_STORAGE_STATE_B64 secret:")
        print(encoded)
        print("\nDo NOT commit koinly-storage-state.json or paste the value into a public file.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
