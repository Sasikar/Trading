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
        private const val PREFS = "market_widget_cache"

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
        val cached = cachedValues(context)
        val initial = baseViews(context)
        initial.setTextViewText(R.id.btc, cached["bitcoin"] ?: "$—")
        initial.setTextViewText(R.id.eth, cached["ethereum"] ?: "$—")
        initial.setTextViewText(R.id.sol, cached["solana"] ?: "$—")
        initial.setTextViewText(R.id.fomo, cached["fomo"] ?: "—")
        manager.updateAppWidget(id, initial)

        Thread {
            val prices = fetchPrices()
            val fomo = fetchFomo()
            if (prices.isNotEmpty() || fomo != null) {
                val views = baseViews(context)
                views.setTextViewText(R.id.btc, prices["bitcoin"] ?: cached["bitcoin"] ?: "$—")
                views.setTextViewText(R.id.eth, prices["ethereum"] ?: cached["ethereum"] ?: "$—")
                views.setTextViewText(R.id.sol, prices["solana"] ?: cached["solana"] ?: "$—")
                views.setTextViewText(R.id.fomo, fomo ?: cached["fomo"] ?: "—")
                saveValues(context, prices, fomo)
                manager.updateAppWidget(id, views)
            }
        }.start()
    }

    private fun fetchPrices(): Map<String, String> {
        // Coinbase is used first because it is a simple public endpoint and does not
        // require an API key. CoinGecko remains a fallback if Coinbase is unavailable.
        val coinbaseIds = mapOf(
            "bitcoin" to "BTC-USD",
            "ethereum" to "ETH-USD",
            "solana" to "SOL-USD"
        )
        val result = mutableMapOf<String, String>()
        coinbaseIds.forEach { (id, symbol) ->
            try {
                val root = JSONObject(get("https://api.coinbase.com/v2/prices/$symbol/spot"))
                val amount = root.getJSONObject("data").getString("amount").toDouble()
                result[id] = formatPrice(amount)
            } catch (_: Exception) { }
        }
        if (result.size == coinbaseIds.size) return result

        try {
            val json = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd")
            val root = JSONObject(json)
            coinbaseIds.keys.forEach { id ->
                if (!result.containsKey(id)) {
                    result[id] = formatPrice(root.getJSONObject(id).getDouble("usd"))
                }
            }
        } catch (_: Exception) { }
        return result
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
        connection.connectTimeout = 8000
        connection.readTimeout = 8000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) MemeWidget/1.1")
        return try {
            if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun cachedValues(context: Context): Map<String, String> {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return mapOf(
            "bitcoin" to p.getString("bitcoin", null),
            "ethereum" to p.getString("ethereum", null),
            "solana" to p.getString("solana", null),
            "fomo" to p.getString("fomo", null)
        ).filterValues { it != null }.mapValues { it.value!! }
    }

    private fun saveValues(context: Context, prices: Map<String, String>, fomo: String?) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
            prices["bitcoin"]?.let { putString("bitcoin", it) }
            prices["ethereum"]?.let { putString("ethereum", it) }
            prices["solana"]?.let { putString("solana", it) }
            fomo?.let { putString("fomo", it) }
        }.apply()
    }
}
