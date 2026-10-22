// Translations for the web page, read from the app's translation files (embedded): preset and profile names, error
// messages and notices, in every language Filee ships. A missing key falls back to English, then to the key.

using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Filee.Core.Localization;

namespace Filee.Web;

/// <summary>One language of the app's translation files.</summary>
public sealed class WebLocalizer : ILocalizer
{
    private readonly Dictionary<string, string> _texts;
    private readonly WebLocalizer? _fallback;

    private WebLocalizer(string language, Dictionary<string, string> texts, WebLocalizer? fallback)
    {
        Language = language;
        _texts = texts;
        _fallback = fallback;
    }

    public string Language { get; }

    public string this[string key] =>
        _texts.TryGetValue(key, out var text) ? text : _fallback is not null ? _fallback[key] : key;

    public string Format(string key, params object[] args) =>
        string.Format(CultureInfo.InvariantCulture, this[key], args);

    public event EventHandler? LanguageChanged { add { } remove { } }

    /// <summary>Every key of this language (English keys included where it has no translation).</summary>
    public IReadOnlyDictionary<string, string> All()
    {
        var all = _fallback is null ? new Dictionary<string, string>() : new Dictionary<string, string>(_fallback._texts);
        foreach (var (key, value) in _texts)
            all[key] = value;
        return all;
    }

    private const string Prefix = "Filee.Web.i18n.";
    private static readonly ConcurrentDictionary<string, WebLocalizer> Cache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Language codes of the embedded translation files ("en", "ko", "pt-BR", ...).</summary>
    public static IReadOnlyList<string> Languages { get; } = typeof(WebLocalizer).Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith(Prefix, StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal))
        .Select(n => n[Prefix.Length..^".json".Length])
        .OrderBy(n => n == "en" ? "" : n, StringComparer.Ordinal)
        .ToList();

    public static WebLocalizer English => For("en");

    /// <summary>
    /// The best language for <paramref name="requested"/> ("pt-BR", "pt", "fr-FR, en;q=0.8"...): the exact one, else
    /// the same base language, else English.
    /// </summary>
    public static WebLocalizer For(string? requested)
    {
        foreach (var candidate in Candidates(requested))
        {
            var match = Languages.FirstOrDefault(l => string.Equals(l, candidate, StringComparison.OrdinalIgnoreCase))
                        ?? Languages.FirstOrDefault(l => string.Equals(l.Split('-')[0], candidate.Split('-')[0], StringComparison.OrdinalIgnoreCase));
            if (match is not null)
                return Cache.GetOrAdd(match, Load);
        }
        return Cache.GetOrAdd("en", Load);
    }

    private static IEnumerable<string> Candidates(string? requested) =>
        (requested ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => part.Split(';')[0].Trim())
            .Where(part => part.Length > 0);

    private static WebLocalizer Load(string language)
    {
        using var stream = typeof(WebLocalizer).Assembly.GetManifestResourceStream(Prefix + language + ".json")
                           ?? throw new InvalidOperationException($"Embedded {language}.json is missing.");
        using var json = JsonDocument.Parse(stream, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        var texts = json.RootElement.EnumerateObject()
            .Where(p => p.Value.ValueKind == JsonValueKind.String)
            .ToDictionary(p => p.Name, p => p.Value.GetString()!);
        return new WebLocalizer(language, texts, language == "en" ? null : Cache.GetOrAdd("en", Load));
    }
}
