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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MarketWidget : AppWidgetProvider() {
    companion object {
        private const val ACTION_REFRESH = "com.sasikar.trading.action.REFRESH_WIDGET"
        private const val PREFS = "market_widget_cache"

        private fun refreshIntent(context: Context, widgetId: Int): PendingIntent {
            val intent = Intent(context, MarketWidget::class.java).apply {
                action = ACTION_REFRESH
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            }
            return PendingIntent.getBroadcast(
                context,
                2000 + widgetId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun nowStamp(): String =
            SimpleDateFormat("h:mm:ss a", Locale.getDefault()).format(Date())

        private fun applyData(
            views: RemoteViews,
            context: Context,
            widgetId: Int,
            loading: Boolean,
            spinFrame: Int = 0
        ) {
            val c = cachedValues(context)
            views.setImageViewResource(R.id.btc_icon, R.drawable.ic_btc)
            views.setImageViewResource(R.id.eth_icon, R.drawable.ic_eth)
            views.setImageViewResource(R.id.sol_icon, R.drawable.ic_sol)
            views.setImageViewResource(R.id.fomo_icon, R.drawable.ic_lightning)
            views.setTextViewText(R.id.btc, c["bitcoin"] ?: "$—")
            views.setTextViewText(R.id.eth, c["ethereum"] ?: "$—")
            views.setTextViewText(R.id.sol, c["solana"] ?: "$—")
            views.setTextViewText(R.id.fomo, c["fomo"] ?: "—")
            if (loading) {
                val frames = arrayOf("↻", "⟳", "↻", "⟳")
                views.setTextViewText(R.id.refresh, frames[spinFrame % frames.size])
                views.setTextViewText(R.id.last_refreshed, "Refreshing…")
                views.setTextColor(R.id.last_refreshed, 0xFF16C784.toInt())
            } else {
                views.setTextViewText(R.id.refresh, "↻")
                views.setTextViewText(
                    R.id.last_refreshed,
                    c["last_refreshed"] ?: "Updated —"
                )
                views.setTextColor(R.id.last_refreshed, 0xFF747B86.toInt())
            }
            views.setOnClickPendingIntent(R.id.refresh, refreshIntent(context, widgetId))
        }

        private fun render(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.market_widget)
            applyData(views, context, id, loading = false)
            manager.updateAppWidget(id, views)
        }

        private fun showLoading(context: Context, manager: AppWidgetManager, ids: IntArray) {
            ids.forEach { id ->
                val views = RemoteViews(context.packageName, R.layout.market_widget)
                applyData(views, context, id, loading = true, spinFrame = 0)
                manager.updateAppWidget(id, views)
            }
        }

        private fun animateRefresh(context: Context, ids: IntArray, running: AtomicBoolean): Thread {
            val manager = AppWidgetManager.getInstance(context)
            return Thread {
                var frame = 0
                while (running.get()) {
                    ids.forEach { id ->
                        val views = RemoteViews(context.packageName, R.layout.market_widget)
                        applyData(views, context, id, loading = true, spinFrame = frame)
                        manager.updateAppWidget(id, views)
                    }
                    frame++
                    try {
                        Thread.sleep(140)
                    } catch (_: InterruptedException) {
                        break
                    }
                }
            }.also { it.start() }
        }

        private fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MarketWidget::class.java))
            if (ids.isEmpty()) return
            showLoading(context, manager, ids)
            val running = AtomicBoolean(true)
            val animator = animateRefresh(context, ids, running)
            try {
                val prices = fetchPrices()
                val fomo = fetchFomo()
                if (prices.isNotEmpty() || fomo != null) saveValues(context, prices, fomo)
            } finally {
                running.set(false)
                try {
                    animator.join(600)
                } catch (_: InterruptedException) {
                }
                ids.forEach { id -> render(context, manager, id) }
            }
        }

        private fun refreshOne(context: Context, id: Int) {
            val manager = AppWidgetManager.getInstance(context)
            showLoading(context, manager, intArrayOf(id))
            val running = AtomicBoolean(true)
            val animator = animateRefresh(context, intArrayOf(id), running)
            try {
                val prices = fetchPrices()
                val fomo = fetchFomo()
                if (prices.isNotEmpty() || fomo != null) saveValues(context, prices, fomo)
            } finally {
                running.set(false)
                try {
                    animator.join(600)
                } catch (_: InterruptedException) {
                }
                render(context, manager, id)
            }
        }

        private fun cachedValues(context: Context): Map<String, String> {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return mapOf(
                "bitcoin" to p.getString("bitcoin", null),
                "ethereum" to p.getString("ethereum", null),
                "solana" to p.getString("solana", null),
                "fomo" to p.getString("fomo", null),
                "last_refreshed" to p.getString("last_refreshed", null)
            ).filterValues { it != null }.mapValues { it.value!! }
        }

        private fun saveValues(context: Context, prices: Map<String, String>, fomo: String?) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                prices["bitcoin"]?.let { putString("bitcoin", it) }
                prices["ethereum"]?.let { putString("ethereum", it) }
                prices["solana"]?.let { putString("solana", it) }
                fomo?.let { putString("fomo", it) }
                putString("last_refreshed", "Updated " + nowStamp())
            }.apply()
        }

        private fun fetchPrices(): Map<String, String> {
            val ids = listOf("bitcoin", "ethereum", "solana")
            val executor = Executors.newFixedThreadPool(3)
            return try {
                val jobs = ids.map { id ->
                    executor.submit(Callable {
                        try {
                            val json = get("https://api.coinbase.com/v2/prices/${idToCoinbase(id)}/spot")
                            val amount = JSONObject(json).getJSONObject("data").getString("amount").toDouble()
                            id to formatPrice(amount)
                        } catch (_: Throwable) {
                            null
                        }
                    })
                }
                val result = mutableMapOf<String, String>()
                jobs.forEach { job -> job.get()?.let { (id, price) -> result[id] = price } }

                if (result.size == ids.size) return result

                try {
                    val root = JSONObject(
                        get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd")
                    )
                    ids.forEach { id ->
                        if (!result.containsKey(id)) {
                            result[id] = formatPrice(root.getJSONObject(id).getDouble("usd"))
                        }
                    }
                } catch (_: Throwable) {
                }
                result
            } finally {
                executor.shutdownNow()
            }
        }

        private fun idToCoinbase(id: String): String = when (id) {
            "bitcoin" -> "BTC-USD"
            "ethereum" -> "ETH-USD"
            else -> "SOL-USD"
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
            connection.connectTimeout = 4000
            connection.readTimeout = 4000
            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-cache, no-store")
            connection.setRequestProperty("Pragma", "no-cache")
            connection.setRequestProperty("User-Agent", "MemeWidget/1.8 (Android)")
            return try {
                if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
                connection.inputStream.bufferedReader().use { it.readText() }
            } finally {
                connection.disconnect()
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> render(context, manager, id) }
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
            val requestedId =
                intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            val pending = goAsync()
            Thread {
                try {
                    if (requestedId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                        refreshOne(context.applicationContext, requestedId)
                    } else {
                        refreshAll(context.applicationContext)
                    }
                } finally {
                    pending.finish()
                }
            }.start()
            return
        }
        super.onReceive(context, intent)
    }
}
