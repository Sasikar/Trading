package com.sasikar.trading

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
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
        private const val REFRESH_REQUEST = 1001

        private fun refreshIntent(context: Context): PendingIntent {
            val intent = Intent(context, MarketWidget::class.java).apply {
                action = ACTION_REFRESH
            }
            return PendingIntent.getBroadcast(
                context,
                REFRESH_REQUEST,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun baseViews(context: Context): RemoteViews {
            return RemoteViews(context.packageName, R.layout.market_widget).apply {
                setImageViewResource(R.id.btc_icon, R.drawable.ic_btc)
                setImageViewResource(R.id.eth_icon, R.drawable.ic_eth)
                setImageViewResource(R.id.sol_icon, R.drawable.ic_sol)
                setImageViewResource(R.id.fomo_icon, R.drawable.ic_lightning)
                setOnClickPendingIntent(R.id.refresh, refreshIntent(context))
            }
        }

        private fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val cached = cachedValues(context)
            val views = baseViews(context)
            views.setTextViewText(R.id.btc, cached["bitcoin"] ?: "$—")
            views.setTextViewText(R.id.eth, cached["ethereum"] ?: "$—")
            views.setTextViewText(R.id.sol, cached["solana"] ?: "$—")
            views.setTextViewText(R.id.fomo, cached["fomo"] ?: "—")
            manager.updateAppWidget(id, views)
        }

        private fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MarketWidget::class.java))
            ids.forEach { id ->
                try {
                    val prices = fetchPrices()
                    val fomo = fetchFomo()
                    if (prices.isNotEmpty() || fomo != null) {
                        saveValues(context, prices, fomo)
                    }
                    render(context, manager, id)
                } catch (_: Throwable) {
                    // Keep the last known values if a network request fails.
                }
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

        private fun fetchPrices(): Map<String, String> {
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
                } catch (_: Throwable) { }
            }
            if (result.size == coinbaseIds.size) return result

            try {
                val root = JSONObject(get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd"))
                coinbaseIds.keys.forEach { id ->
                    if (!result.containsKey(id)) {
                        result[id] = formatPrice(root.getJSONObject(id).getDouble("usd"))
                    }
                }
            } catch (_: Throwable) { }
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
        } catch (_: Throwable) {
            null
        }

        private fun get(urlString: String): String {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-cache")
            connection.setRequestProperty("User-Agent", "MemeWidget/1.3 (Android)")
            return try {
                if (connection.responseCode !in 200..299) {
                    throw IllegalStateException("HTTP ${connection.responseCode}")
                }
                connection.inputStream.bufferedReader().use { it.readText() }
            } finally {
                connection.disconnect()
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id ->
            try {
                render(context, manager, id)
            } catch (_: Throwable) { }
        }
        val pending = goAsync()
        Thread {
            try {
                refreshAll(context.applicationContext)
            } finally {
                pending.finish()
            }
        }.start()
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_REFRESH || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val pending = goAsync()
            Thread {
                try {
                    refreshAll(context.applicationContext)
                } finally {
                    pending.finish()
                }
            }.start()
            return
        }
        super.onReceive(context, intent)
    }
}
