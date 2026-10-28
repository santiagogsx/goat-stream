// Goat Stream for Xbox — created by Santiago.
// Hosts the shared Goat Stream UI (web/, packaged inside the app) in the console's Edge WebView2 and gives it the
// same native powers as the Android TV app: networking without browser limits, finding the PC on the home network,
// the 4K/HDR player (MainPage.Player.cs) and opening other apps. The page talks to us with chrome.webview messages.
using System;
using Microsoft.Web.WebView2.Core;
using Windows.ApplicationModel;
using Windows.Data.Json;
using Windows.Security.ExchangeActiveSyncProvisioning;
using Windows.Storage.Streams;
using Windows.System;
using Windows.System.Profile;
using Windows.UI.Core;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace GoatStream
{
    public sealed partial class MainPage : Page
    {
        // The UI is served from the app package under this made-up address. Never change it: the console's link to
        // the PC and all settings are saved per address.
        const string AppHost = "goatstream.example";
        // Covers from the PC are plain http on the home network; the page asks for them here and we fetch them
        // (a secure page may not show plain-http pictures by itself).
        const string PcHost = "pc.goatstream.example";

        readonly Net net = new Net();

        public MainPage()
        {
            InitializeComponent();
            // draw to the very edges of the TV (the page keeps its own margins)
            ApplicationView.GetForCurrentView().SetDesiredBoundsMode(ApplicationViewBoundsMode.UseCoreWindow);
            SystemNavigationManager.GetForCurrentView().BackRequested += OnBack;
            Window.Current.CoreWindow.KeyDown += OnPlayerKey;
            Application.Current.EnteredBackground += (s, e) => RunOnUi(() => { if (playing) ClosePlayer("back"); });
            Application.Current.LeavingBackground += (s, e) => Send(Msg("resume"));
            InitPlayer();
            Start();
        }

        async void Start()
        {
            await Web.EnsureCoreWebView2Async();
            var core = Web.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
#if !DEBUG
            core.Settings.AreDevToolsEnabled = false;
#endif
            core.SetVirtualHostNameToFolderMapping(AppHost, "web", CoreWebView2HostResourceAccessKind.Allow);
            core.AddWebResourceRequestedFilter("https://" + PcHost + "/*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnPcPicture;

            // tells app.js it is running on Xbox (MODE 'xbox') and gives it the console's name and the app version
            var info = new JsonObject();
            info.SetNamedValue("device", JsonValue.CreateStringValue(DeviceName()));
            info.SetNamedValue("version", JsonValue.CreateStringValue(AppVersion()));
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__goatXbox = " + info.Stringify() + ";");

            core.WebMessageReceived += OnMessage;
            core.NavigationStarting += OnNavigationStarting;
            core.NewWindowRequested += OnNewWindow;
            core.ProcessFailed += (s, e) => { if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited) Web.Reload(); };

            Web.Source = new Uri("https://" + AppHost + "/index.html");
            Web.Focus(FocusState.Programmatic);
        }

        // ----- messages from the page -----
        void OnMessage(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            if (!args.Source.StartsWith("https://" + AppHost + "/", StringComparison.OrdinalIgnoreCase)) return;
            JsonObject m;
            try { if (!JsonObject.TryParse(args.TryGetWebMessageAsString(), out m)) return; } catch (Exception) { return; }
            switch (m.GetNamedString("t", ""))
            {
                case "http": DoHttp(m); break;
                case "discover": Discover(); break;
                case "play": OpenPlayer(m.GetNamedObject("req", new JsonObject())); break;
                case "launch": Launch(m.GetNamedString("name", "")); break;
            }
        }

        /// Async HTTP for the UI. Answers {t:'http', id, status, text}. status 0 = network error.
        async void DoHttp(JsonObject m)
        {
            var r = await net.Request(m.GetNamedString("method", "GET"), m.GetNamedString("url", ""),
                m.GetNamedObject("headers", new JsonObject()), m.GetNamedString("body", ""), 45000);
            var o = Msg("http");
            o.SetNamedValue("id", JsonValue.CreateNumberValue(m.GetNamedNumber("id", 0)));
            o.SetNamedValue("status", JsonValue.CreateNumberValue(r.Status));
            o.SetNamedValue("text", JsonValue.CreateStringValue(r.Text));
            Send(o);
        }

        /// Finds Goat Stream PCs on the home network. Answers {t:'discovered', list:[{host, port, name}]}.
        async void Discover()
        {
            var o = Msg("discovered");
            o.SetNamedValue("list", await net.Discover());
            Send(o);
        }

        /// Streaming apps (Netflix, YouTube…): open their page in the Microsoft Store, which offers "Launch" or "Get".
        async void Launch(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return;
            try { await Launcher.LaunchUriAsync(new Uri("ms-windows-store://search/?query=" + Uri.EscapeDataString(name))); }
            catch (Exception) { Toast("Open " + name + " from your Xbox home screen."); }
        }

        // ----- PC pictures: https://pc.goatstream.example/192.168.1.20:8787/art/x.jpg?t=…  ->  http://192.168.1.20:8787/art/x.jpg?t=… -----
        async void OnPcPicture(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
        {
            var deferral = args.GetDeferral();
            try
            {
                var u = new Uri(args.Request.Uri);
                var target = new Uri("http://" + u.PathAndQuery.TrimStart('/'));
                if (!Net.IsHomeNetwork(target.Host))
                {
                    args.Response = sender.Environment.CreateWebResourceResponse(new InMemoryRandomAccessStream(), 403, "Forbidden", "");
                    return;
                }
                var pic = await net.Fetch(target);
                var stream = new InMemoryRandomAccessStream();
                if (pic.Data != null) await stream.WriteAsync(pic.Data);
                stream.Seek(0);
                args.Response = sender.Environment.CreateWebResourceResponse(stream, pic.Status, pic.Status == 200 ? "OK" : "Error",
                    "Content-Type: " + pic.ContentType + "\r\nCache-Control: max-age=86400\r\nAccess-Control-Allow-Origin: *");
            }
            catch (Exception)
            {
                args.Response = sender.Environment.CreateWebResourceResponse(new InMemoryRandomAccessStream(), 502, "Bad Gateway", "");
            }
            finally { deferral.Complete(); }
        }

        // ----- stay inside Goat Stream; other web pages open in the console's browser -----
        void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
        {
            if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var u)) return;
            if (u.Host.Equals(AppHost, StringComparison.OrdinalIgnoreCase) || u.Scheme == "about" || u.Scheme == "data") return;
            args.Cancel = true;
            _ = Launcher.LaunchUriAsync(u);
        }

        void OnNewWindow(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
        {
            args.Handled = true;
            if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var u)) _ = Launcher.LaunchUriAsync(u);
        }

        // ----- B button / Back -----
        void OnBack(object sender, BackRequestedEventArgs e)
        {
            // Never leave the app by accident; the Xbox button always goes home.
            e.Handled = true;
            if (playing) { ClosePlayer("back"); return; }
            Send(Msg("back"));   // app.js: close the top window / go back to Home (ignored if the page already did it)
        }

        // ----- helpers -----
        static JsonObject Msg(string type)
        {
            var o = new JsonObject();
            o.SetNamedValue("t", JsonValue.CreateStringValue(type));
            return o;
        }

        void Toast(string text)
        {
            var o = Msg("toast");
            o.SetNamedValue("text", JsonValue.CreateStringValue(text));
            Send(o);
        }

        void Send(JsonObject o)
        {
            var json = o.Stringify();
            RunOnUi(() => Web.CoreWebView2?.PostWebMessageAsJson(json));
        }

        void RunOnUi(DispatchedHandler a)
        {
            if (Dispatcher.HasThreadAccess) a();
            else _ = Dispatcher.RunAsync(CoreDispatcherPriority.Normal, a);
        }

        static string DeviceName()
        {
            // e.g. "Xbox Series X"; the PC shows it in the "Allow this device?" pop-up
            var form = AnalyticsInfo.DeviceForm ?? "";
            if (form.IndexOf("Xbox", StringComparison.OrdinalIgnoreCase) >= 0) return form;
            try
            {
                var n = new EasClientDeviceInformation().FriendlyName;
                if (!string.IsNullOrWhiteSpace(n)) return n;
            }
            catch (Exception) { }
            return "Xbox";
        }

        static string AppVersion()
        {
            var v = Package.Current.Id.Version;
            return v.Major + "." + v.Minor + "." + v.Build;
        }
    }
}
