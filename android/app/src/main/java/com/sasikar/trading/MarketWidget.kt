package com.sasikar.trading

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MarketWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            val initial = RemoteViews(context.packageName, R.layout.market_widget)
            initial.setTextViewText(R.id.title, "BTC  ·  ETH  ·  FOMO INDEX")
            initial.setTextViewText(R.id.btc, "BTC  …")
            initial.setTextViewText(R.id.eth, "ETH  …")
            initial.setTextViewText(R.id.fomo, "FOMO Index  …")
            manager.updateAppWidget(id, initial)

            Thread {
                val btc = fetchPrice("BTCUSDT")
                val eth = fetchPrice("ETHUSDT")
                val fomo = fetchFomo()
                val views = RemoteViews(context.packageName, R.layout.market_widget)
                views.setTextViewText(R.id.title, "BTC  ·  ETH  ·  FOMO INDEX")
                views.setTextViewText(R.id.btc, "BTC  ${btc ?: "—"}")
                views.setTextViewText(R.id.eth, "ETH  ${eth ?: "—"}")
                views.setTextViewText(R.id.fomo, "FOMO Index  ${fomo ?: "—"}")
                manager.updateAppWidget(id, views)
            }.start()
        }
    }

    private fun fetchPrice(symbol: String): String? = try {
        val json = get("https://api.binance.com/api/v3/ticker/price?symbol=$symbol")
        val price = JSONObject(json).getString("price").toDouble()
        String.format(Locale.US, "%.2f", price)
    } catch (_: Exception) { null }

    private fun fetchFomo(): String? = try {
        val json = get("https://api.alternative.me/fng/?limit=1")
        JSONObject(json).getJSONArray("data").getJSONObject(0).getString("value")
    } catch (_: Exception) { null }

    private fun get(urlString: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        connection.requestMethod = "GET"
        return connection.inputStream.bufferedReader().use { it.readText() }.also { connection.disconnect() }
    }
}
