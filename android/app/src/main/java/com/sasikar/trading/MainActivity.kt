package com.sasikar.trading

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONObject

class MainActivity : Activity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(Bridge(), "ATrader")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                // Fetch feed with Chrome networking (works when HttpURLConnection is blocked)
                view?.evaluateJavascript(
                    """
                    (function(){
                      fetch('https://sasikar.github.io/Trading/data/widget-prices.json?t='+Date.now())
                        .then(function(r){ return r.text(); })
                        .then(function(t){ ATrader.onFeed(t); })
                        .catch(function(e){ ATrader.onError(String(e)); });
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
        web.loadUrl("https://sasikar.github.io/Trading/")
        setContentView(web)

        // Also try native path in parallel
        Thread {
            val ok = PriceStore.refreshFromNetwork(applicationContext)
            if (ok) {
                MarketWidget.pushUpdate(applicationContext)
                runOnUiThread {
                    Toast.makeText(this, PriceStore.summary(this), Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    inner class Bridge {
        @JavascriptInterface
        fun onFeed(json: String) {
            try {
                val root = JSONObject(json)
                val ok = PriceStore.applyFeed(applicationContext, root)
                MarketWidget.pushUpdate(applicationContext)
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        if (ok) PriceStore.summary(this@MainActivity) else "Feed parse empty",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "JS parse: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun onError(msg: String) {
            runOnUiThread {
                Toast.makeText(this@MainActivity, "JS fetch: $msg", Toast.LENGTH_LONG).show()
            }
        }
    }
}
