package com.sasikar.trading

import android.app.PendingIntent
import android.os.Build
import android.os.SystemClock
import android.app.AlarmManager
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
        private const val ACTION_AUTO = "com.sasikar.trading.action.AUTO_REFRESH_WIDGET"
        private const val PREFS = "market_widget_cache"
        private const val AUTO_REQ = 7001
        private const val INTERVAL_MS = 5 * 60 * 1000L // 5 minutes
        private val SPIN = arrayOf("↻", "⟳", "↻", "⟳", "↻", "⟳")

        fun scheduleAutoRefresh(context: Context) {
            try {
                val app = context.applicationContext
                val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(app, MarketWidget::class.java).apply { action = ACTION_AUTO }
                val pi = PendingIntent.getBroadcast(
                    app, AUTO_REQ, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val trigger = System.currentTimeMillis() + INTERVAL_MS
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi)
                } else {
                    @Suppress("DEPRECATION")
                    am.set(AlarmManager.RTC_WAKEUP, trigger, pi)
                }
            } catch (_: Throwable) {
            }
        }

        fun cancelAutoRefresh(context: Context) {
            try {
                val app = context.applicationContext
                val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                val intent = Intent(app, MarketWidget::class.java).apply { action = ACTION_AUTO }
                val pi = PendingIntent.getBroadcast(
                    app, AUTO_REQ, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                am.cancel(pi)
            } catch (_: Throwable) {
            }
        }

        private fun refreshIntent(context: Context, widgetId: Int): PendingIntent {
            val intent = Intent(context, MarketWidget::class.java).apply {
                action = ACTION_REFRESH
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            }
            return PendingIntent.getBroadcast(
                context,
                6000 + widgetId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun nowStamp(): String =
            SimpleDateFormat("h:mm:ss a", Locale.getDefault()).format(Date())

        /** e.g. "just now", "1m", "2m", "1h 3m" from epoch ms */
        private fun ageLabel(fromMs: Long): String {
            if (fromMs <= 0L) return "—m"
            val mins = ((System.currentTimeMillis() - fromMs) / 60000L).coerceAtLeast(0L)
            return when {
                mins <= 0L -> "just now"
                mins == 1L -> "1m ago"
                mins < 60L -> "${mins}m ago"
                else -> {
                    val h = mins / 60L
                    val m = mins % 60L
                    if (m == 0L) "${h}h ago" else "${h}h ${m}m ago"
                }
            }
        }

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
                views.setTextViewText(R.id.refresh_age, "…")
                views.setTextColor(R.id.refresh_age, Color.parseColor("#16C784"))
                views.setTextViewText(R.id.last_refreshed, "Refreshing…")
                views.setTextColor(R.id.last_refreshed, Color.parseColor("#16C784"))
            } else {
                views.setTextViewText(R.id.refresh, "↻")
                val ms = try {
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getLong("last_refreshed_ms", 0L)
                } catch (_: Throwable) { 0L }
                val age = ageLabel(ms)
                views.setTextViewText(R.id.refresh_age, age)
                views.setTextColor(R.id.refresh_age, Color.parseColor("#9AA3AD"))
                views.setTextViewText(R.id.last_refreshed, (c["last_refreshed"] ?: "Updated —") + " · " + age)
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
                saveValues(context, prices, fomo, nasdaq)
                if (prices.isEmpty()) {
                    try {
                        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                            .putString("last_refreshed", "No data · check network")
                            .apply()
                    } catch (_: Throwable) {}
                }
            } catch (e: Throwable) {
                try {
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putString("last_refreshed", "Err: " + (e.message ?: "fetch"))
                        .apply()
                } catch (_: Throwable) {}
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
                listOf("bitcoin", "ethereum", "solana", "fomo", "nasdaq", "nasdaq_dir", "last_refreshed", "last_refreshed_ms")
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
                val got = prices.isNotEmpty() || fomo != null || nasdaq != null
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
                    prices.forEach { (k, v) -> putString(k, v) }
                    fomo?.let { putString("fomo", it) }
                    nasdaq?.let { (text, dir) ->
                        putString("nasdaq", text)
                        putString("nasdaq_dir", dir)
                    }
                    // Only mark "just now" when at least one value actually arrived
                    if (got) {
                        val ms = System.currentTimeMillis()
                        putLong("last_refreshed_ms", ms)
                        putString("last_refreshed", "Updated " + nowStamp())
                    }
                }.apply()
            } catch (_: Throwable) {
            }
        }

                private fun fetchPrices(): Map<String, String> {
            val result = linkedMapOf<String, String>()
            fun put(id: String, v: Double?) {
                if (v != null && v > 0 && !result.containsKey(id)) result[id] = formatPrice(v)
            }
            // A) Binance (usually works on Indian mobile networks)
            try {
                put("bitcoin", JSONObject(get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT")).getString("price").toDouble())
            } catch (_: Throwable) {}
            try {
                put("ethereum", JSONObject(get("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT")).getString("price").toDouble())
            } catch (_: Throwable) {}
            try {
                put("solana", JSONObject(get("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT")).getString("price").toDouble())
            } catch (_: Throwable) {}
            // B) Coinbase
            if (result.size < 3) {
                for ((id, pair) in listOf("bitcoin" to "BTC-USD", "ethereum" to "ETH-USD", "solana" to "SOL-USD")) {
                    if (result.containsKey(id)) continue
                    try {
                        val amt = JSONObject(get("https://api.coinbase.com/v2/prices/$pair/spot"))
                            .getJSONObject("data").getString("amount").toDouble()
                        put(id, amt)
                    } catch (_: Throwable) {}
                }
            }
            // C) Kraken
            if (result.size < 3) {
                try {
                    val root = JSONObject(get("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD")).getJSONObject("result")
                    val it = root.keys()
                    while (it.hasNext()) {
                        val k = it.next()
                        try {
                            val px = root.getJSONObject(k).getJSONArray("c").getString(0).toDouble()
                            val u = k.uppercase()
                            when {
                                u.contains("XBT") || u.contains("BTC") -> put("bitcoin", px)
                                u.contains("ETH") -> put("ethereum", px)
                                u.contains("SOL") -> put("solana", px)
                            }
                        } catch (_: Throwable) {}
                    }
                } catch (_: Throwable) {}
            }
            // D) CoinGecko
            if (result.size < 3) {
                try {
                    val root = JSONObject(get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd"))
                    put("bitcoin", root.optJSONObject("bitcoin")?.optDouble("usd"))
                    put("ethereum", root.optJSONObject("ethereum")?.optDouble("usd"))
                    put("solana", root.optJSONObject("solana")?.optDouble("usd"))
                } catch (_: Throwable) {}
            }
            return result
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
         * Correct day % for NASDAQ Composite (^IXIC).
         *
         * Yahoo's daily chart `chartPreviousClose` is often wrong (not last session).
         * The 1-minute / 1-day chart exposes the real prior session close in:
         *   meta.previousClose  and  meta.chartPreviousClose
         * Live level: meta.regularMarketPrice
         */
        private fun fetchNasdaq(): Pair<String, String>? {
            // Primary: intraday 1d chart — previousClose is true prior session close
            try {
                val json = get(
                    "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1m&range=1d"
                )
                val meta = JSONObject(json)
                    .getJSONObject("chart")
                    .getJSONArray("result")
                    .getJSONObject(0)
                    .getJSONObject("meta")

                val price = meta.optDouble("regularMarketPrice", Double.NaN)
                var prev = meta.optDouble("previousClose", Double.NaN)
                if (prev.isNaN()) prev = meta.optDouble("chartPreviousClose", Double.NaN)

                if (!price.isNaN() && !prev.isNaN() && prev > 0) {
                    return formatNasdaqDay(price, prev)
                }
            } catch (_: Throwable) {
            }

            // Fallback: daily bars — use second-to-last completed close as prior
            return try {
                val json = get(
                    "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d&range=10d"
                )
                val result = JSONObject(json)
                    .getJSONObject("chart")
                    .getJSONArray("result")
                    .getJSONObject(0)
                val meta = result.getJSONObject("meta")
                val live = meta.optDouble("regularMarketPrice", Double.NaN)
                val closesArr = result.getJSONObject("indicators")
                    .getJSONArray("quote")
                    .getJSONObject(0)
                    .getJSONArray("close")
                val closes = mutableListOf<Double>()
                for (i in 0 until closesArr.length()) {
                    if (!closesArr.isNull(i)) closes.add(closesArr.getDouble(i))
                }
                if (closes.size < 2) return null
                val prior = closes[closes.size - 2]
                val price = if (!live.isNaN()) live else closes.last()
                formatNasdaqDay(price, prior)
            } catch (_: Throwable) {
                null
            }
        }

        private fun formatNasdaqDay(price: Double, prev: Double): Pair<String, String> {
            val change = price - prev
            val pct = if (prev != 0.0) (change / prev) * 100.0 else 0.0
            val arrow = when {
                change > 0.05 -> "▲"
                change < -0.05 -> "▼"
                else -> "•"
            }
            val sign = if (pct > 0) "+" else ""
            val dir = when {
                change > 0.05 -> "up"
                change < -0.05 -> "down"
                else -> "flat"
            }
            // e.g. 26,683.42  ▲ +0.54%
            val text = String.format(
                Locale.US,
                "%,.2f  %s %s%.2f%%",
                price,
                arrow,
                sign,
                pct
            )
            return text to dir
        }

        private fun get(urlString: String): String {
            var last: Exception? = null
            // retry twice
            repeat(2) { attempt ->
                var connection: HttpURLConnection? = null
                try {
                    connection = URL(urlString).openConnection() as HttpURLConnection
                    connection.connectTimeout = 15000
                    connection.readTimeout = 15000
                    connection.requestMethod = "GET"
                    connection.useCaches = false
                    connection.instanceFollowRedirects = true
                    connection.setRequestProperty("Accept", "application/json,*/*")
                    connection.setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36"
                    )
                    val code = connection.responseCode
                    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                    val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
                    if (code in 200..299 && body.isNotBlank()) return body
                    last = IllegalStateException("HTTP $code ${body.take(80)}")
                } catch (e: Exception) {
                    last = e
                    try { Thread.sleep(200L * (attempt + 1)) } catch (_: InterruptedException) {}
                } finally {
                    try { connection?.disconnect() } catch (_: Throwable) {}
                }
            }
            throw last ?: IllegalStateException("request failed")
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        try {
            ids.forEach { id -> render(context.applicationContext, manager, id, false) }
        } catch (_: Throwable) {
        }
        scheduleAutoRefresh(context.applicationContext)
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

    override fun onEnabled(context: Context) {
        scheduleAutoRefresh(context.applicationContext)
        super.onEnabled(context)
    }

    override fun onDisabled(context: Context) {
        cancelAutoRefresh(context.applicationContext)
        super.onDisabled(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == ACTION_REFRESH || action == ACTION_AUTO
            || action == Intent.ACTION_MY_PACKAGE_REPLACED
            || action == Intent.ACTION_BOOT_COMPLETED
        ) {
            val requestedId =
                intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            val pending = goAsync()
            Thread {
                try {
                    if (action == ACTION_AUTO || action == Intent.ACTION_BOOT_COMPLETED
                        || action == Intent.ACTION_MY_PACKAGE_REPLACED
                    ) {
                        scheduleAutoRefresh(context.applicationContext)
                    }
                    if (requestedId != AppWidgetManager.INVALID_APPWIDGET_ID && action == ACTION_REFRESH) {
                        refreshOne(context.applicationContext, requestedId)
                    } else {
                        refreshAll(context.applicationContext)
                    }
                    // chain next 5-min alarm after each auto refresh
                    if (action == ACTION_AUTO) {
                        scheduleAutoRefresh(context.applicationContext)
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
