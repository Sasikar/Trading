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
                3000 + widgetId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun nowStamp(): String =
            SimpleDateFormat("h:mm:ss a", Locale.getDefault()).format(Date())

        private fun buildViews(
            context: Context,
            widgetId: Int,
            loading: Boolean,
            rotation: Float = 0f
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.market_widget)
            val c = cachedValues(context)
            try {
                views.setImageViewResource(R.id.btc_icon, R.drawable.ic_btc)
                views.setImageViewResource(R.id.eth_icon, R.drawable.ic_eth)
                views.setImageViewResource(R.id.sol_icon, R.drawable.ic_sol)
                views.setImageViewResource(R.id.fomo_icon, R.drawable.ic_lightning)
                views.setTextViewText(R.id.btc, c["bitcoin"] ?: "$—")
                views.setTextViewText(R.id.eth, c["ethereum"] ?: "$—")
                views.setTextViewText(R.id.sol, c["solana"] ?: "$—")
                views.setTextViewText(R.id.fomo, c["fomo"] ?: "—")
                views.setTextViewText(R.id.nasdaq, c["nasdaq"] ?: "—")
                views.setTextViewText(R.id.refresh, "↻")
                if (loading) {
                    views.setTextViewText(R.id.last_refreshed, "Refreshing…")
                    try {
                        views.setFloat(R.id.refresh, "setRotation", rotation)
                    } catch (_: Throwable) {
                    }
                } else {
                    views.setTextViewText(R.id.last_refreshed, c["last_refreshed"] ?: "Updated —")
                    try {
                        views.setFloat(R.id.refresh, "setRotation", 0f)
                    } catch (_: Throwable) {
                    }
                }
                views.setOnClickPendingIntent(R.id.refresh, refreshIntent(context, widgetId))
                // Also allow tapping the whole card to refresh
                views.setOnClickPendingIntent(R.id.root, refreshIntent(context, widgetId))
            } catch (_: Throwable) {
            }
            return views
        }

        private fun render(
            context: Context,
            manager: AppWidgetManager,
            id: Int,
            loading: Boolean = false,
            rotation: Float = 0f
        ) {
            try {
                manager.updateAppWidget(id, buildViews(context, id, loading, rotation))
            } catch (_: Throwable) {
            }
        }

        private fun animateSpin(
            context: Context,
            ids: IntArray,
            running: AtomicBoolean
        ): Thread {
            val manager = AppWidgetManager.getInstance(context)
            return Thread {
                var angle = 0f
                while (running.get()) {
                    ids.forEach { id ->
                        render(context, manager, id, loading = true, rotation = angle)
                    }
                    angle = (angle + 45f) % 360f
                    try {
                        Thread.sleep(100)
                    } catch (_: InterruptedException) {
                        break
                    }
                }
            }.also { it.start() }
        }

        private fun doRefresh(context: Context, ids: IntArray) {
            if (ids.isEmpty()) return
            val manager = AppWidgetManager.getInstance(context)
            ids.forEach { render(context, manager, it, loading = true, rotation = 0f) }
            val running = AtomicBoolean(true)
            val spinner = animateSpin(context, ids, running)
            try {
                val prices = fetchPrices()
                val fomo = fetchFomo()
                val nasdaq = fetchNasdaq()
                saveValues(context, prices, fomo, nasdaq)
            } catch (_: Throwable) {
            } finally {
                running.set(false)
                try {
                    spinner.join(400)
                } catch (_: InterruptedException) {
                }
                ids.forEach { render(context, manager, it, loading = false) }
            }
        }

        private fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, MarketWidget::class.java))
            doRefresh(context, ids)
        }

        private fun refreshOne(context: Context, id: Int) {
            doRefresh(context, intArrayOf(id))
        }

        private fun cachedValues(context: Context): Map<String, String> {
            return try {
                val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                mapOf(
                    "bitcoin" to p.getString("bitcoin", null),
                    "ethereum" to p.getString("ethereum", null),
                    "solana" to p.getString("solana", null),
                    "fomo" to p.getString("fomo", null),
                    "nasdaq" to p.getString("nasdaq", null),
                    "last_refreshed" to p.getString("last_refreshed", null)
                ).filterValues { it != null }.mapValues { it.value!! }
            } catch (_: Throwable) {
                emptyMap()
            }
        }

        private fun saveValues(
            context: Context,
            prices: Map<String, String>,
            fomo: String?,
            nasdaq: String?
        ) {
            try {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                    prices["bitcoin"]?.let { putString("bitcoin", it) }
                    prices["ethereum"]?.let { putString("ethereum", it) }
                    prices["solana"]?.let { putString("solana", it) }
                    fomo?.let { putString("fomo", it) }
                    nasdaq?.let { putString("nasdaq", it) }
                    putString("last_refreshed", "Updated " + nowStamp())
                }.apply()
            } catch (_: Throwable) {
            }
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
                jobs.forEach { job ->
                    try {
                        job.get()?.let { (id, price) -> result[id] = price }
                    } catch (_: Throwable) {
                    }
                }
                if (result.size < ids.size) {
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

        private fun formatIndex(value: Double): String =
            String.format(Locale.US, "%,.2f", value)

        private fun fetchFomo(): String? = try {
            val json = get("https://api.alternative.me/fng/?limit=1")
            JSONObject(json).getJSONArray("data").getJSONObject(0).getString("value")
        } catch (_: Throwable) {
            null
        }

        private fun fetchNasdaq(): String? {
            // Yahoo Finance chart for ^IXIC (NASDAQ Composite)
            return try {
                val json = get("https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d&range=1d")
                val meta = JSONObject(json)
                    .getJSONObject("chart")
                    .getJSONArray("result")
                    .getJSONObject(0)
                    .getJSONObject("meta")
                val price = meta.optDouble("regularMarketPrice", Double.NaN)
                if (price.isNaN()) null else formatIndex(price)
            } catch (_: Throwable) {
                try {
                    // Fallback: Stooq CSV
                    val csv = get("https://stooq.com/q/l/?s=^ndq&f=sd2t2ohlcv&h&e=csv")
                    val line = csv.lineSequence().drop(1).firstOrNull() ?: return null
                    val close = line.split(",").getOrNull(6)?.toDoubleOrNull() ?: return null
                    formatIndex(close)
                } catch (_: Throwable) {
                    null
                }
            }
        }

        private fun get(urlString: String): String {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.connectTimeout = 6000
            connection.readTimeout = 6000
            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json,text/plain,*/*")
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) MemeWidget/2.0")
            return try {
                if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
                connection.inputStream.bufferedReader().use { it.readText() }
            } finally {
                connection.disconnect()
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        try {
            ids.forEach { id -> render(context, manager, id, loading = false) }
            val pending = goAsync()
            Thread {
                try {
                    refreshAll(context.applicationContext)
                } catch (_: Throwable) {
                } finally {
                    try {
                        pending.finish()
                    } catch (_: Throwable) {
                    }
                }
            }.start()
        } catch (_: Throwable) {
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        try {
            val action = intent.action
            if (action == ACTION_REFRESH || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
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
                    } catch (_: Throwable) {
                    } finally {
                        try {
                            pending.finish()
                        } catch (_: Throwable) {
                        }
                    }
                }.start()
                return
            }
        } catch (_: Throwable) {
        }
        try {
            super.onReceive(context, intent)
        } catch (_: Throwable) {
        }
    }
}
