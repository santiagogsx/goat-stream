// Goat Stream for Xbox — home-network helpers. Created by Santiago.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Networking;
using Windows.Networking.Connectivity;
using Windows.Networking.Sockets;
using Windows.Storage.Streams;
using Windows.Web.Http;
using Windows.Web.Http.Filters;
using Windows.Web.Http.Headers;

namespace GoatStream
{
    sealed class HttpResult
    {
        public int Status;
        public string Text = "";
    }

    sealed class Picture
    {
        public int Status;
        public IBuffer Data;
        public string ContentType = "image/jpeg";
    }

    sealed class Net
    {
        // Goat Stream on the PC: web server port and the "who's there?" broadcast port (same as the Android TV app)
        const int ServerPort = 8787;
        const int DiscoveryPort = 8788;

        readonly HttpClient client;

        public Net()
        {
            var f = new HttpBaseProtocolFilter { AllowUI = false, AutomaticDecompression = true };
            f.CacheControl.ReadBehavior = HttpCacheReadBehavior.MostRecent;    // the library changes; always ask the PC
            f.CacheControl.WriteBehavior = HttpCacheWriteBehavior.NoCache;
            client = new HttpClient(f);
        }

        /// Any HTTP request for the UI (no browser limits: plain http to the PC, cloud sign-in, GitHub…).
        public async Task<HttpResult> Request(string method, string url, JsonObject headers, string body, int timeoutMs)
        {
            try
            {
                var req = new HttpRequestMessage(new HttpMethod(method), new Uri(url));
                string contentType = null;
                foreach (var kv in headers)
                {
                    var v = kv.Value.ValueType == JsonValueType.String ? kv.Value.GetString() : kv.Value.Stringify();
                    if (kv.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) contentType = v;
                    else req.Headers.TryAppendWithoutValidation(kv.Key, v);
                }
                if (method != "GET" && method != "HEAD")
                {
                    var content = new HttpStringContent(body ?? "", Windows.Storage.Streams.UnicodeEncoding.Utf8);
                    if (contentType != null) content.Headers.ContentType = HttpMediaTypeHeaderValue.Parse(contentType);
                    req.Content = content;
                }
                using (var cts = new CancellationTokenSource(timeoutMs))
                using (var resp = await client.SendRequestAsync(req).AsTask(cts.Token))
                {
                    var buf = await resp.Content.ReadAsBufferAsync().AsTask(cts.Token);
                    var bytes = buf.ToArray();
                    return new HttpResult { Status = (int)resp.StatusCode, Text = Encoding.UTF8.GetString(bytes, 0, bytes.Length) };
                }
            }
            catch (Exception e)
            {
                return new HttpResult { Status = 0, Text = e.Message ?? "network error" };
            }
        }

        /// A picture from the PC (covers, backdrops) for the page.
        public async Task<Picture> Fetch(Uri url)
        {
            using (var cts = new CancellationTokenSource(20000))
            using (var resp = await client.GetAsync(url).AsTask(cts.Token))
            {
                var pic = new Picture { Status = (int)resp.StatusCode, Data = await resp.Content.ReadAsBufferAsync().AsTask(cts.Token) };
                var ct = resp.Content.Headers.ContentType;
                if (ct != null) pic.ContentType = ct.MediaType;
                return pic;
            }
        }

        /// Only the home network (the PC), never the internet: 10.x, 172.16–31.x, 192.168.x, 169.254.x,
        /// or a home name like "my-pc" / "my-pc.local".
        public static bool IsHomeNetwork(string host)
        {
            if (string.IsNullOrEmpty(host)) return false;
            var p = host.Split('.');
            if (p.Length == 4 && p.All(x => int.TryParse(x, out var n) && n >= 0 && n <= 255))
            {
                int a = int.Parse(p[0]), b = int.Parse(p[1]);
                return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
            }
            var h = host.ToLowerInvariant();
            return h.IndexOf('.') < 0 || h.EndsWith(".local") || h.EndsWith(".lan") || h.EndsWith(".home.arpa");
        }

        /// Finds Goat Stream PCs: broadcasts GOATSTREAM_DISCOVER on UDP 8788 for ~2.5 s and collects the answers.
        /// If nothing answers (some routers block broadcasts), asks every address on the home network instead.
        public async Task<JsonArray> Discover()
        {
            var found = new Dictionary<string, JsonObject>();
            try
            {
                using (var sock = new DatagramSocket())
                {
                    sock.MessageReceived += (s, a) =>
                    {
                        try
                        {
                            var r = a.GetDataReader();
                            var j = JsonObject.Parse(r.ReadString(r.UnconsumedBufferLength));
                            if (j.GetNamedString("app", "") != "goatstream") return;
                            var host = a.RemoteAddress.CanonicalName;
                            j.SetNamedValue("host", JsonValue.CreateStringValue(host));
                            lock (found) found[host] = j;
                        }
                        catch (Exception) { }
                    };
                    await sock.BindServiceNameAsync("");
                    var targets = Broadcasts();
                    targets.Add("255.255.255.255");
                    for (var round = 0; round < 3; round++)
                    {
                        foreach (var t in targets)
                        {
                            try
                            {
                                var output = await sock.GetOutputStreamAsync(new HostName(t), DiscoveryPort.ToString());
                                var w = new DataWriter(output);
                                w.WriteString("GOATSTREAM_DISCOVER");
                                await w.StoreAsync();
                                w.DetachStream();
                            }
                            catch (Exception) { }
                        }
                        await Task.Delay(800);
                    }
                    await Task.Delay(200);
                }
            }
            catch (Exception) { }

            if (found.Count == 0) await Scan(found);
            var list = new JsonArray();
            lock (found) foreach (var j in found.Values) list.Add(j);
            return list;
        }

        // About 250 quick "are you Goat Stream?" questions (/api/info), like the Samsung / LG apps do.
        async Task Scan(Dictionary<string, JsonObject> found)
        {
            var prefixes = MyAddresses().Select(ip => string.Join(".", ip.Split('.').Take(3))).Distinct().ToList();
            foreach (var pre in prefixes)
            {
                var hosts = Enumerable.Range(1, 254).Select(i => pre + "." + i).ToList();
                for (var i = 0; i < hosts.Count; i += 48)
                {
                    await Task.WhenAll(hosts.Skip(i).Take(48).Select(async host =>
                    {
                        var r = await Request("GET", "http://" + host + ":" + ServerPort + "/api/info", new JsonObject(), null, 1800);
                        if (r.Status != 200 || !JsonObject.TryParse(r.Text, out var j) || j.GetNamedString("app", "") != "goatstream") return;
                        var o = new JsonObject();
                        o.SetNamedValue("host", JsonValue.CreateStringValue(host));
                        o.SetNamedValue("port", JsonValue.CreateNumberValue(ServerPort));
                        o.SetNamedValue("name", JsonValue.CreateStringValue(j.GetNamedString("name", "Goat Stream PC")));
                        lock (found) found[host] = o;
                    }));
                }
                if (found.Count > 0) return;
            }
        }

        // This console's own home-network addresses (IPv4) with their network size, for the broadcast addresses
        static IEnumerable<HostName> Mine() =>
            NetworkInformation.GetHostNames().Where(h => h.Type == HostNameType.Ipv4 && h.IPInformation != null && IsHomeNetwork(h.CanonicalName));

        static List<string> MyAddresses() => Mine().Select(h => h.CanonicalName).ToList();

        static List<string> Broadcasts()
        {
            var list = new List<string>();
            foreach (var h in Mine())
            {
                var prefix = h.IPInformation.PrefixLength ?? 24;
                var parts = h.CanonicalName.Split('.').Select(byte.Parse).ToArray();
                uint ip = (uint)(parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]);
                uint mask = prefix == 0 ? 0 : uint.MaxValue << (32 - prefix);
                uint b = ip | ~mask;
                list.Add((b >> 24) + "." + ((b >> 16) & 255) + "." + ((b >> 8) & 255) + "." + (b & 255));
            }
            return list.Distinct().ToList();
        }
    }
}
