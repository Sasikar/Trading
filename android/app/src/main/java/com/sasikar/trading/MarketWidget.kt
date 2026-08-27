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
            val intent = Intent(context, MarketWidget::class.java).apply { action = ACTION_REFRESH }
            return PendingIntent.getBroadcast(
                context, 1001, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun baseViews(context: Context) = RemoteViews(context.packageName, R.layout.market_widget).apply {
            setImageViewResource(R.id.btc_icon, R.drawable.ic_btc)
            setImageViewResource(R.id.eth_icon, R.drawable.ic_eth)
            setImageViewResource(R.id.sol_icon, R.drawable.ic_sol)
            setImageViewResource(R.id.fomo_icon, R.drawable.ic_lightning)
            setOnClickPendingIntent(R.id.refresh, refreshIntent(context))
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { refreshWidget(context, manager, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val manager = AppWidgetManager.getInstance(context)
            manager.getAppWidgetIds(android.content.ComponentName(context, MarketWidget::class.java))
                .forEach { refreshWidget(context, manager, it) }
        }
    }

    private fun refreshWidget(context: Context, manager: AppWidgetManager, id: Int) {
        val initial = baseViews(context)
        initial.setTextViewText(R.id.btc, "$—")
        initial.setTextViewText(R.id.eth, "$—")
        initial.setTextViewText(R.id.sol, "$—")
        initial.setTextViewText(R.id.fomo, "—")
        manager.updateAppWidget(id, initial)

        Thread {
            val prices = fetchPrices()
            val fomo = fetchFomo()
            val views = baseViews(context)
            views.setTextViewText(R.id.btc, prices["bitcoin"] ?: "$—")
            views.setTextViewText(R.id.eth, prices["ethereum"] ?: "$—")
            views.setTextViewText(R.id.sol, prices["solana"] ?: "$—")
            views.setTextViewText(R.id.fomo, fomo ?: "—")
            manager.updateAppWidget(id, views)
        }.start()
    }

    private fun fetchPrices(): Map<String, String> = try {
        val json = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd")
        val root = JSONObject(json)
        mapOf(
            "bitcoin" to formatPrice(root.getJSONObject("bitcoin").getDouble("usd")),
            "ethereum" to formatPrice(root.getJSONObject("ethereum").getDouble("usd")),
            "solana" to formatPrice(root.getJSONObject("solana").getDouble("usd"))
        )
    } catch (_: Exception) {
        emptyMap()
    }

    private fun formatPrice(price: Double): String = when {
        price >= 1000 -> String.format(Locale.US, "$%,.0f", price)
        price >= 1 -> String.format(Locale.US, "$%,.2f", price)
        else -> String.format(Locale.US, "$%.6f", price).trimEnd('0').trimEnd('.')
    }

    private fun fetchFomo(): String? = try {
        val json = get("https://api.alternative.me/fng/?limit=1")
        JSONObject(json).getJSONArray("data").getJSONObject(0).getString("value")
    } catch (_: Exception) { null }

    private fun get(urlString: String): String {
        val connection = URL(urlString).openConnection() as HttpURLConnection
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        connection.requestMethod = "GET"
        connection.setRequestProperty("User-Agent", "Meme-Android-Widget/1.0")
        return try {
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }
}
