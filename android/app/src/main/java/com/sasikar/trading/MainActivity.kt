package com.sasikar.trading

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.webViewClient = WebViewClient()
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.loadUrl("https://sasikar.github.io/Trading/")
        setContentView(web)

        Thread {
            try {
                MarketWidget.refreshAllBlocking(applicationContext)
                val p = getSharedPreferences("market_widget_cache", Context.MODE_PRIVATE)
                val btc = p.getString("bitcoin", null)
                val eth = p.getString("ethereum", null)
                val msg = if (btc != null) "BTC $btc · ETH ${eth ?: "—"}" else (p.getString("last_refreshed", "No prices"))
                runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }
            } catch (e: Throwable) {
                runOnUiThread {
                    Toast.makeText(this, "Fail: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }
}
