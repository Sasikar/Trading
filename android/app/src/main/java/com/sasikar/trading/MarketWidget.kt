package com.sasikar.trading

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
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
        private val SPIN = arrayOf("↻", "⟳", "↻", "⟳", "↻", "⟳")

        private fun refreshIntent(context: Context, widgetId: Int): PendingIntent {
            val intent = Intent(context, MarketWidget::class.java).apply {
                action = ACTION_REFRESH
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            }
            return PendingIntent.getBroadcast(
                context,
                7000 + widgetId,
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
            spinIndex: Int = 0
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.market_widget)
            val c = cachedValues(context)

            views.setImageViewResource(R.id.btc_icon, R.drawable.ic_btc)
            views.setImageViewResource(R.id.eth_icon, R.drawable.ic_eth)
            views.setImageViewResource(R.id.sol_icon, R.drawable.ic_sol)
            views.setImageViewResource(R.id.fomo_icon, R.drawable.ic_lightning)

            views.setTextViewText(R.id.btc, c["bitcoin"] ?: "$—")
            views.setTextViewText(R.id.eth, c["ethereum"] ?: "$—")
            views.setTextViewText(R.id.sol, c["solana"] ?: "$—")
            views.setTextViewText(R.id.fomo, c["fomo"] ?: "—")
            views.setTextViewText(R.id.nasdaq, c["nasdaq"] ?: "—")

            when (c["nasdaq_dir"]) {
                "up" -> views.setTextColor(R.id.nasdaq, Color.parseColor("#16C784"))
                "down" -> views.setTextColor(R.id.nasdaq, Color.parseColor("#EA3943"))
                else -> views.setTextColor(R.id.nasdaq, Color.parseColor("#FFFFFF"))
            }

            if (loading) {
                views.setTextViewText(R.id.refresh, SPIN[spinIndex % SPIN.size])
                views.setTextViewText(R.id.last_refreshed, "Refreshing…")
                views.setTextColor(R.id.last_refreshed, Color.parseColor("#16C784"))
            } else {
                views.setTextViewText(R.id.refresh, "↻")
                views.setTextViewText(R.id.last_refreshed, c["last_refreshed"] ?: "Updated —")
                views.setTextColor(R.id.last_refreshed, Color.parseColor("#747B86"))
            }

            val pi = refreshIntent(context, widgetId)
            views.setOnClickPendingIntent(R.id.refresh, pi)
            views.setOnClickPendingIntent(R.id.root, pi)
            return views
        }

        private fun render(
            context: Context,
            manager: AppWidgetManager,
            id: Int,
            loading: Boolean,
            spinIndex: Int = 0
        ) {
            try {
                manager.updateAppWidget(id, buildViews(context, id, loading, spinIndex))
            } catch (_: Throwable) {
            }
        }

        private fun spinWhile(
            context: Context,
            ids: IntArray,
            running: AtomicBoolean
        ): Thread {
            val manager = AppWidgetManager.getInstance(context)
            return Thread {
                var i = 0
                while (running.get()) {
                    ids.forEach { id -> render(context, manager, id, true, i) }
                    i++
                    try {
                        Thread.sleep(130)
                    } catch (_: InterruptedException) {
                        break
                    }
                }
            }.also { it.start() }
        }

        private fun doRefresh(context: Context, ids: IntArray) {
            if (ids.isEmpty()) return
            val manager = AppWidgetManager.getInstance(context)
            ids.forEach { render(context, manager, it, true, 0) }
            val running = AtomicBoolean(true)
            val spinner = spinWhile(context, ids, running)
            try {
                val prices = fetchPrices()
                val fomo = fetchFomo()
                val nasdaq = fetchNasdaq()
                // Always write nasdaq when present so stale +1.3% cache is cleared
                saveValues(context, prices, fomo, nasdaq)
            } catch (_: Throwable) {
            } finally {
                running.set(false)
                try {
                    spinner.join(500)
                } catch (_: InterruptedException) {
                }
                ids.forEach { render(context, manager, it, false) }
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
                listOf("bitcoin", "ethereum", "solana", "fomo", "nasdaq", "nasdaq_dir", "last_refreshed")
                    .mapNotNull { k -> p.getString(k, null)?.let { k to it } }
                    .toMap()
            } catch (_: Throwable) {
                emptyMap()
            }
        }

        private fun saveValues(
            context: Context,
            prices: Map<String, String>,
            fomo: String?,
            nasdaq: Pair<String, String>?
        ) {
            try {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                    prices.forEach { (k, v) -> putString(k, v) }
                    fomo?.let { putString("fomo", it) }
                    if (nasdaq != null) {
                        putString("nasdaq", nasdaq.first)
                        putString("nasdaq_dir", nasdaq.second)
                    }
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
                            val pair = when (id) {
                                "bitcoin" -> "BTC-USD"
                                "ethereum" -> "ETH-USD"
                                else -> "SOL-USD"
                            }
                            val json = get("https://api.coinbase.com/v2/prices/$pair/spot")
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

        private fun formatPrice(price: Double): String = when {
            price >= 1000 -> String.format(Locale.US, "$%,.0f", price)
            price >= 1 -> String.format(Locale.US, "$%,.2f", price)
            else -> String.format(Locale.US, "$%.4f", price)
        }

        private fun fetchFomo(): String? = try {
            val json = get("https://api.alternative.me/fng/?limit=1")
            JSONObject(json).getJSONArray("data").getJSONObject(0).getString("value")
        } catch (_: Throwable) {
            null
        }

        /**
         * Day % vs PRIOR COMPLETED SESSION close (same basis as TradingView).
         * NEVER use meta.chartPreviousClose — Yahoo sets that to an older reference.
         *
         * Series of daily closes: [..., yesterday, today_or_live]
         * prior = yesterday's close (second-to-last non-null)
         * live  = regularMarketPrice when present
         */
        private fun fetchNasdaq(): Pair<String, String>? {
            return try {
                val json = get(
                    "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC" +
                        "?interval=1d&range=1mo&includePrePost=false"
                )
                val result = JSONObject(json)
                    .getJSONObject("chart")
                    .getJSONArray("result")
                    .getJSONObject(0)
                val meta = result.getJSONObject("meta")
                val live = meta.optDouble("regularMarketPrice", Double.NaN)

                val closesJson = result.getJSONObject("indicators")
                    .getJSONArray("quote")
                    .getJSONObject(0)
                    .getJSONArray("close")

                val closes = ArrayList<Double>(closesJson.length())
                for (i in 0 until closesJson.length()) {
                    if (!closesJson.isNull(i)) closes.add(closesJson.getDouble(i))
                }
                if (closes.size < 2) return null

                // Last bar is today's session (in progress or finished).
                // Prior completed session = second-to-last bar.
                val priorSessionClose = closes[closes.size - 2]
                val price = if (!live.isNaN()) live else closes.last()

                formatNasdaqDay(price, priorSessionClose)
            } catch (_: Throwable) {
                null
            }
        }

        private fun formatNasdaqDay(price: Double, priorClose: Double): Pair<String, String> {
            val change = price - priorClose
            val pct = if (priorClose != 0.0) (change / priorClose) * 100.0 else 0.0
            val arrow = when {
                change > 0.05 -> "▲"
                change < -0.05 -> "▼"
                else -> "•"
            }
            val dir = when {
                change > 0.05 -> "up"
                change < -0.05 -> "down"
                else -> "flat"
            }
            // TradingView style: 26,499.77  ▼ -41.59 (-0.16%)
            val text = String.format(
                Locale.US,
                "%,.2f  %s %,.2f (%+.2f%%)",
                price,
                arrow,
                change,
                pct
            )
            return text to dir
        }

        private fun get(urlString: String): String {
            val connection = URL(urlString).openConnection() as HttpURLConnection
            connection.connectTimeout = 7000
            connection.readTimeout = 7000
            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.setRequestProperty("Accept", "*/*")
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 MemeWidget/2.5")
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
        try {
            ids.forEach { id -> render(context.applicationContext, manager, id, false) }
        } catch (_: Throwable) {
        }
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
    }

    override fun onReceive(context: Context, intent: Intent) {
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
        super.onReceive(context, intent)
    }
}
