# Koinly session connection

GitHub Actions cannot see the cookies/session from a Koinly login performed in your phone or desktop browser. The safe bridge is a one-time Playwright storage-state capture.

## One-time setup

1. On a computer with Python 3.11+ installed:
   ```bash
   pip install playwright
   playwright install chromium
   ```
2. Run:
   ```bash
   python tools/koinly_manual_login.py
   ```
3. Chromium opens Koinly.
4. Log in normally with Google/Gmail.
5. Return to the terminal and press Enter.
6. The script prints a base64 session value.
7. Add that value to the GitHub repository secret named `KOINLY_STORAGE_STATE_B64`.
8. Add a strong random value as `KOINLY_DATA_KEY` for the encrypted dashboard dataset.
9. Run the **Koinly Live Sync** workflow manually once. After that it is scheduled hourly.

The browser session can expire. When that happens, repeat the one-time capture and replace the secret. The workflow keeps the last successful dataset instead of publishing empty data.

Never commit `koinly-storage-state.json`; it contains authenticated session material.
