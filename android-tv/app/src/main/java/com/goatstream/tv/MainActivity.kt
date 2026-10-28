package com.goatstream.tv

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.Executors

/**
 * Hosts the shared Goat Stream UI (assets/web) in a WebView and gives it native powers:
 * networking without browser limits, finding the PC on the home network, the 4K player, and launching other apps.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val io = Executors.newFixedThreadPool(6)
    private val main = Handler(Looper.getMainLooper())

    private val playerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val json = r.data?.getStringExtra(PlayerActivity.EXTRA_RESULT) ?: return@registerForActivityResult
        js("window.goatPlayerClosed && window.goatPlayerClosed(${JSONObject.quote(json)})")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW   // thumbnails come from the PC over plain http
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        // without this, any browser pop-up (confirm/alert) is silently answered "no"
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(), "GoatTV")
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        setContentView(web)
        web.requestFocus()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.goatBack && window.goatBack()) ? 'y' : 'n'") { v ->
                    if (v == null || !v.contains("y")) finish()
                }
            }
        })

        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onResume() {
        super.onResume()
        js("window.goatResume && window.goatResume()")
    }

    override fun onDestroy() {
        io.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    private fun js(code: String) = main.post { if (!isDestroyed) web.evaluateJavascript(code, null) }

    inner class Bridge {
        /** Async HTTP for the UI. Calls back window.__goatHttp(id, status, text). status 0 = network error. */
        @JavascriptInterface
        fun http(id: Int, method: String, url: String, headersJson: String, body: String) {
            io.execute {
                val (code, text) = doHttp(method, url, headersJson, body)
                js("window.__goatHttp($id,$code,${JSONObject.quote(text)})")
            }
        }

        /** Finds Goat Stream PCs on the home network. Calls back window.goatDiscovered(json). */
        @JavascriptInterface
        fun discover() {
            io.execute {
                val list = findServers(this@MainActivity)
                js("window.goatDiscovered && window.goatDiscovered(${JSONObject.quote(list.toString())})")
            }
        }

        /** Opens the native 4K player. */
        @JavascriptInterface
        fun play(json: String) {
            main.post {
                playerLauncher.launch(Intent(this@MainActivity, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_REQUEST, json))
            }
        }

        @JavascriptInterface
        fun deviceName(): String {
            val n = try { Settings.Global.getString(contentResolver, "device_name") } catch (e: Exception) { null }
            return n?.takeIf { it.isNotBlank() } ?: "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        }

        @JavascriptInterface
        fun appVersion(): String = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "0"
        } catch (e: Exception) { "0" }

        /**
         * Downloads a newer Goat Stream APK and opens Android's installer.
         * Progress: window.goatUpdateProgress(percent) — -1 with a message on failure, 100 when the installer opens.
         */
        @JavascriptInterface
        fun installUpdate(url: String) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
                // one-time: allow Goat Stream to install its own updates
                main.post {
                    try {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    } catch (_: Exception) {}
                }
                js("window.goatUpdateProgress && window.goatUpdateProgress(-1, 'allow')")
                return
            }
            io.execute {
                try {
                    val dir = File(cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                    val apk = File(dir, "goat-stream-update.apk")
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.instanceFollowRedirects = true
                    c.connectTimeout = 15000
                    c.readTimeout = 60000
                    val total = c.contentLengthLong
                    var done = 0L
                    var lastPct = -1
                    c.inputStream.use { input ->
                        apk.outputStream().use { out ->
                            val buf = ByteArray(256 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                done += n
                                val pct = if (total > 0) (done * 99 / total).toInt() else 50
                                if (pct != lastPct) { lastPct = pct; js("window.goatUpdateProgress && window.goatUpdateProgress($pct)") }
                            }
                        }
                    }
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.updates", apk)
                    main.post {
                        startActivity(Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                    js("window.goatUpdateProgress && window.goatUpdateProgress(100)")
                } catch (e: Exception) {
                    js("window.goatUpdateProgress && window.goatUpdateProgress(-1, ${JSONObject.quote(e.message ?: "download failed")})")
                }
            }
        }

        /** Returns which of the given packages are installed (JSON array). */
        @JavascriptInterface
        fun installedApps(pkgsJson: String): String {
            val pkgs = JSONArray(pkgsJson)
            val out = JSONArray()
            for (i in 0 until pkgs.length()) {
                val p = pkgs.getString(i)
                if (launchIntentFor(p) != null) out.put(p)
            }
            return out.toString()
        }

        /** Launches a streaming app; if it isn't installed, opens its Play Store page. Returns true if the app opened. */
        @JavascriptInterface
        fun launchApp(pkg: String): Boolean {
            val intent = launchIntentFor(pkg)
            main.post {
                try {
                    if (intent != null) startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    else startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) {
                    js("window.__goatToast && window.__goatToast('Couldn\\'t open that app')")
                }
            }
            return intent != null
        }
    }

    private fun launchIntentFor(pkg: String): Intent? =
        packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: packageManager.getLaunchIntentForPackage(pkg)

    private fun doHttp(method: String, url: String, headersJson: String, body: String): Pair<Int, String> = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 6000
        c.readTimeout = 45000
        c.instanceFollowRedirects = true
        val h = JSONObject(headersJson.ifBlank { "{}" })
        h.keys().forEach { c.setRequestProperty(it, h.getString(it)) }
        if (method != "GET" && method != "HEAD") {
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = c.responseCode
        val stream = if (code >= 400) c.errorStream else c.inputStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        c.disconnect()
        code to text
    } catch (e: Exception) {
        0 to (e.message ?: "network error")
    }

    /** Broadcasts GOATSTREAM_DISCOVER on UDP 8788 for ~2.5 s and collects replies. */
    private fun findServers(ctx: Context): JSONArray {
        val found = LinkedHashMap<String, JSONObject>()
        val wifi = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = wifi?.createMulticastLock("goatstream")?.apply { setReferenceCounted(false); acquire() }
        try {
            DatagramSocket().use { s ->
                s.broadcast = true
                s.soTimeout = 350
                val msg = "GOATSTREAM_DISCOVER".toByteArray()
                val targets = broadcastAddresses() + InetAddress.getByName("255.255.255.255")
                val end = System.currentTimeMillis() + 2500
                var nextSend = 0L
                while (System.currentTimeMillis() < end) {
                    if (System.currentTimeMillis() >= nextSend) {
                        for (t in targets) try { s.send(DatagramPacket(msg, msg.size, t, 8788)) } catch (_: Exception) {}
                        nextSend = System.currentTimeMillis() + 800
                    }
                    val buf = ByteArray(2048)
                    val p = DatagramPacket(buf, buf.size)
                    try {
                        s.receive(p)
                        val j = JSONObject(String(p.data, 0, p.length))
                        if (j.optString("app") == "goatstream") {
                            val host = p.address.hostAddress ?: continue
                            j.put("host", host)
                            found[host] = j
                        }
                    } catch (_: SocketTimeoutException) {
                    } catch (_: Exception) {
                    }
                }
            }
        } catch (_: Exception) {
        } finally {
            lock?.release()
        }
        return JSONArray(found.values)
    }

    private fun broadcastAddresses(): List<InetAddress> = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { ni -> ni.interfaceAddresses.mapNotNull { it.broadcast } }
    } catch (_: Exception) {
        emptyList()
    }
}
