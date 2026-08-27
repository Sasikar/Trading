package com.sasikar.trading

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MarketWidget : AppWidgetProvider() {
    companion object {
        private const val ACTION_REFRESH = "com.sasikar.trading.action.REFRESH_WIDGET"

        private fun refreshIntent(context: Context): PendingIntent {
            val intent = Intent(context, MarketWidget::class.java).apply {
                action = ACTION_REFRESH
            }
            return PendingIntent.getBroadcast(
                context,
                1001,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { refreshWidget(context, manager, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(android.content.ComponentName(context, MarketWidget::class.java))
            ids.forEach { refreshWidget(context, manager, it) }
        }
    }

    private fun refreshWidget(context: Context, manager: AppWidgetManager, id: Int) {
        val initial = RemoteViews(context.packageName, R.layout.market_widget)
        initial.setTextViewText(R.id.title, "BTC  ·  ETH  ·  FEAR & GREED")
        initial.setTextViewText(R.id.btc, "BTC  …")
        initial.setTextViewText(R.id.eth, "ETH  …")
        initial.setTextViewText(R.id.fomo, "Fear & Greed Index  …")
        initial.setOnClickPendingIntent(R.id.refresh, refreshIntent(context))
        manager.updateAppWidget(id, initial)

        Thread {
            val btc = fetchPrice("BTCUSDT")
            val eth = fetchPrice("ETHUSDT")
            val fomo = fetchFomo()
            val views = RemoteViews(context.packageName, R.layout.market_widget)
            views.setTextViewText(R.id.title, "BTC  ·  ETH  ·  FEAR & GREED")
            views.setTextViewText(R.id.btc, "BTC  ${btc ?: "—"}")
            views.setTextViewText(R.id.eth, "ETH  ${eth ?: "—"}")
            views.setTextViewText(R.id.fomo, "Fear & Greed Index  ${fomo ?: "—"}")
            views.setOnClickPendingIntent(R.id.refresh, refreshIntent(context))
            manager.updateAppWidget(id, views)
        }.start()
    }

    private fun fetchPrice(symbol: String): String? = try {
        val json = get("https://api.binance.com/api/v3/ticker/price?symbol=$symbol")
        val price = JSONObject(json).getString("price").toDouble()
        when {
            price >= 1000 -> String.format(Locale.US, "$%,.0f", price)
            price >= 1 -> String.format(Locale.US, "$%.2f", price)
            else -> String.format(Locale.US, "$%.6f", price).trimEnd('0').trimEnd('.')
        }
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
