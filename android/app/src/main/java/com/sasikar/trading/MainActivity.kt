package com.sasikar.trading

import android.app.Activity
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
        web.settings.setSupportZoom(false)
        web.loadUrl("https://sasikar.github.io/Trading/")
        setContentView(web)
        // Force a price pull while app is in foreground (most reliable on OEMs)
        Thread {
            try {
                MarketWidget.refreshAllBlocking(applicationContext)
                runOnUiThread {
                    Toast.makeText(this, "ATrader prices updated", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Throwable) {
                runOnUiThread {
                    Toast.makeText(this, "Price update failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }
}
