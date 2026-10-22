// Entry point of the Filee web server: the page (wwwroot) and its API (Api.cs) on one port, http://0.0.0.0:8080 in
// the container. Optional password: FILEE_USERNAME / FILEE_PASSWORD turn on HTTP basic authentication.

using System.Text;
using System.Text.Json.Serialization;
using Filee.Web;
using Microsoft.AspNetCore.ResponseCompression;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = FileeServer.MaxUploadBytes + 16 * 1024 * 1024);
builder.Services.Configure<FormOptions>(form =>
{
    form.MultipartBodyLengthLimit = FileeServer.MaxUploadBytes + 16 * 1024 * 1024;
    form.ValueCountLimit = 10_000;
});
builder.Services.ConfigureHttpJsonOptions(json => json.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[] { "application/manifest+json", "image/svg+xml" });
});
builder.Services.AddSingleton<FileeServer>();
builder.Services.AddHostedService(services => services.GetRequiredService<FileeServer>());

var app = builder.Build();

var user = Environment.GetEnvironmentVariable("FILEE_USERNAME") ?? "filee";
var password = Environment.GetEnvironmentVariable("FILEE_PASSWORD");
if (!string.IsNullOrEmpty(password))
{
    var expected = "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{password}"));
    app.Use(async (context, next) =>
    {
        // The health check stays open for Docker and load balancers.
        if (context.Request.Path.StartsWithSegments("/healthz")
            || System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(context.Request.Headers.Authorization.ToString()), Encoding.UTF8.GetBytes(expected)))
        {
            await next();
            return;
        }
        context.Response.Headers.WWWAuthenticate = "Basic realm=\"Filee\", charset=\"UTF-8\"";
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    });
}

app.UseResponseCompression();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers["Referrer-Policy"] = "same-origin";
    headers.XFrameOptions = "SAMEORIGIN";
    await next();
});

var contentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypes.Mappings[".webmanifest"] = "application/manifest+json";
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypes,
    OnPrepareResponse = file =>
    {
        // The page and its service worker are checked on every visit; icons may be cached.
        var name = file.File.Name;
        file.Context.Response.Headers.CacheControl = name.EndsWith(".png", StringComparison.Ordinal) || name.EndsWith(".svg", StringComparison.Ordinal)
            ? "public, max-age=86400" : "no-cache";
    },
});

app.MapGet("/healthz", () => Results.Text("ok"));
Api.Map(app);

// Android's "Share" sheet posts files here (see share_target in manifest.webmanifest): the service worker normally
// takes the request; without it, go back to the page.
app.MapPost("/share", () => Results.Redirect("/?share=unavailable")).DisableAntiforgery();

app.Run();
