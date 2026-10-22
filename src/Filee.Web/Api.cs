// The page's HTTP API. Everything the desktop app does from its donut and Home page, over HTTP:
//   GET  /api/info                 version, languages, limits, engines
//   GET  /api/i18n/{lang}          the app's texts in one language
//   GET  /api/formats              every format Filee knows
//   GET  /api/presets              the preset library (for the page's preset editor)
//   POST /api/donut                the donut for some file names: profile, front and back face, groups, reasons
//   POST /api/jobs                 upload files (multipart) and/or links and convert them with a preset or a format
//   GET  /api/jobs/{id}            progress and results
//   GET  /api/jobs/{id}/files/{n}  download one result;  GET /api/jobs/{id}/zip  every result in one ZIP
//   POST /api/jobs/{id}/cancel     cancel;  DELETE /api/jobs/{id}  cancel and delete the files

using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Serialization;
using Filee.Core.Conversion;
using Filee.Core.Formats;
using Filee.Core.Localization;
using Filee.Core.Presets;
using Filee.Core.Profiles;
using Microsoft.AspNetCore.StaticFiles;

namespace Filee.Web;

public static class Api
{
    /// <summary>Presets sent by the page (its own presets, kept in the browser): the app's JSON shape.</summary>
    public static readonly JsonSerializerOptions PresetJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static void Map(WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/info", (FileeServer server) => new
        {
            version = typeof(Api).Assembly.GetName().Version?.ToString(3) ?? "",
            languages = WebLocalizer.Languages,
            maxUploadBytes = FileeServer.MaxUploadBytes,
            allowUrls = FileeServer.AllowUrls,
            jobLifetimeMinutes = (int)FileeServer.JobLifetime.TotalMinutes,
            engines = server.Catalog.Ordered.Select(c =>
            {
                var status = server.Catalog.StatusOf(c);
                return new { id = c.Id, name = c.DisplayName, available = status.IsAvailable, reason = status.ReasonKey, version = status.Version };
            }),
        });

        api.MapGet("/i18n/{lang}", (string lang) => Results.Json(WebLocalizer.For(lang).All()));

        api.MapGet("/formats", () => FormatRegistry.Known.Where(f => f.Id != FormatRegistry.Folder).Select(f => new
        {
            id = f.Id, name = f.DisplayName, category = f.Category.ToString(), extensions = f.Extensions, writable = f.Writable,
        }));

        api.MapGet("/presets", (FileeServer server, string? lang) =>
        {
            var loc = WebLocalizer.For(lang);
            return server.Store.Presets.Select(p => new
            {
                id = p.Id, name = loc.DisplayName(p), target = p.TargetFormat, group = p.IsGroup, tool = p.IsTool,
                members = p.SubPresetIds,
            });
        });

        api.MapGet("/profiles", (FileeServer server, string? lang) =>
        {
            var loc = WebLocalizer.For(lang);
            return server.Store.Profiles.Select(p => new
            {
                id = p.Id, name = loc.DisplayName(p), extensions = p.Extensions, mixed = p.IsFallback,
                presetIds = p.PresetIds, backPresetIds = p.BackPresetIds ?? new List<string>(),
            });
        });

        api.MapPost("/donut", (FileeServer server, DonutRequest request) => Donut(server, request));

        api.MapPost("/jobs", StartAsync).DisableAntiforgery();

        api.MapGet("/jobs/{id}", (FileeServer server, string id, string? lang) =>
            server.Find(id) is { } web ? Results.Json(Status(web, WebLocalizer.For(lang))) : Results.NotFound());

        api.MapGet("/jobs/{id}/files/{index:int}", (FileeServer server, string id, int index, bool? inline) =>
        {
            if (server.Find(id) is not { } web)
                return Results.NotFound();
            var outputs = Outputs(web);
            if (index < 0 || index >= outputs.Count || !File.Exists(outputs[index]))
                return Results.NotFound();
            var path = outputs[index];
            var type = ContentTypes.TryGetContentType(path, out var t) ? t : "application/octet-stream";
            return Results.File(path, type, inline == true ? null : Path.GetFileName(path), enableRangeProcessing: true);
        });

        api.MapGet("/jobs/{id}/zip", async (FileeServer server, string id) =>
        {
            if (server.Find(id) is not { } web || !web.IsFinished)
                return Results.NotFound();
            var outputs = Outputs(web).Where(File.Exists).ToList();
            if (outputs.Count == 0)
                return Results.NotFound();
            var zip = Path.Combine(web.Folder, "filee-results.zip");
            if (!File.Exists(zip))
                await Task.Run(() =>
                {
                    var partial = zip + ".part";
                    using (var archive = ZipFile.Open(partial, ZipArchiveMode.Create))
                    {
                        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var path in outputs)
                        {
                            var relative = Path.GetRelativePath(web.OutputFolder, path).Replace('\\', '/');
                            if (relative.StartsWith("..", StringComparison.Ordinal))
                                relative = Path.GetFileName(path);
                            archive.CreateEntryFromFile(path, Unique(names, relative), CompressionLevel.Fastest);
                        }
                    }
                    File.Move(partial, zip, overwrite: true);
                });
            return Results.File(zip, "application/zip", $"filee-{web.Job.Preset.TargetFormat.Trim('*')}-{web.Id[..6]}.zip".Replace("--", "-"));
        });

        api.MapPost("/jobs/{id}/cancel", (FileeServer server, string id) =>
        {
            if (server.Find(id) is not { } web)
                return Results.NotFound();
            web.Job.Cancel();
            return Results.NoContent();
        }).DisableAntiforgery();

        api.MapDelete("/jobs/{id}", (FileeServer server, string id) =>
        {
            server.Remove(id);
            return Results.NoContent();
        });
    }

    // ───────────────────────────── donut ─────────────────────────────

    /// <summary>What the page asks the donut for.</summary>
    /// <param name="Names">File names (only their extensions matter).</param>
    /// <param name="Lang">Language of the names and reasons.</param>
    /// <param name="Guess">The files are still being dragged and the browser hasn't said every type: anything may be possible.</param>
    /// <param name="Custom">The page's own presets (JSON in the app's preset shape), judged like the library's.</param>
    public sealed record DonutRequest(List<string>? Names, string? Lang, bool Guess, List<JsonElement>? Custom);

    public sealed record Slice(string Id, string Name, string Ring, string Target, bool Group, bool Tool, bool Usable,
        string? Reason, IReadOnlyList<Slice>? Members, string? Description);

    private static object Donut(FileeServer server, DonutRequest request)
    {
        var loc = WebLocalizer.For(request.Lang);
        var names = (request.Names ?? new List<string>()).Where(n => !string.IsNullOrWhiteSpace(n)).Select(SafeName).ToList();
        var formats = ProfileSelector.DetectFormats(names);
        var profile = ProfileSelector.Select(server.Store.Profiles, names);
        var session = server.Availability.For(formats, request.Guess);

        Slice Make(Preset preset, int depth = 0)
        {
            var reason = session.ReasonKey(preset);
            IReadOnlyList<Slice>? members = null;
            if (preset.IsGroup && depth == 0)
            {
                members = preset.SubPresetIds.Select(server.Store.FindPreset).OfType<Preset>()
                    .Where(p => !p.IsGroup).Select(p => Make(p, 1)).ToList();
                if (members.Count == 0 || members.All(m => !m.Usable))
                    reason = members.Count == 0 ? "donut.group_empty" : members[0].Reason is { } r ? KeyOf(loc, r) : "error.no_route";
            }
            return new Slice(preset.Id, loc.DisplayName(preset), loc.RingName(preset), preset.TargetFormat, preset.IsGroup, preset.IsTool,
                reason is null, reason is null ? null : loc[reason], members, Describe(preset, loc));
        }

        List<Slice> Face(IEnumerable<string>? ids) =>
            (ids ?? Enumerable.Empty<string>()).Select(server.Store.FindPreset).OfType<Preset>().Take(ToolbarProfile.MaxSlices).Select(p => Make(p)).ToList();

        var custom = new List<Slice>();
        foreach (var element in request.Custom ?? new List<JsonElement>())
        {
            if (ReadPreset(element) is { } preset && !preset.IsGroup)
                custom.Add(Make(preset));
        }

        var extensions = names.Select(FormatRegistry.ExtensionOf).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var single = formats.Count == 1 && extensions.Count == 1;
        return new
        {
            profile = profile is null ? null : new { id = profile.Id, name = loc.DisplayName(profile) },
            caption = names.Count == 0 ? loc["donut.center_drag"]
                : single ? loc.Format("donut.files_same", names.Count, formats[0].DisplayName)
                : loc.Format("donut.files_mixed", names.Count),
            front = Face(profile?.PresetIds),
            back = Face(profile?.BackPresetIds),
            custom,
            targets = session.Targets().Select(f => new { id = f.Id, name = f.DisplayName, category = f.Category.ToString() }),
            formats = formats.Select(f => f.Id),
        };
    }

    /// <summary>A reason text back to its key (members already hold localized text).</summary>
    private static string KeyOf(ILocalizer loc, string text) =>
        new[] { "error.no_route", "error.unsupported_source", "error.cannot_turn" }.FirstOrDefault(k => loc[k] == text) ?? "error.no_route";

    /// <summary>One line about what a preset does, for the page's tooltips.</summary>
    private static string? Describe(Preset preset, ILocalizer loc)
    {
        if (preset.IsGroup || preset.IsTool)
            return null;
        var target = preset.TargetFormat == BuiltInData.SameAsSource ? loc["donut.same_format"]
            : FormatRegistry.FindById(preset.TargetFormat)?.DisplayName ?? preset.TargetFormat.ToUpperInvariant();
        return $"→ {target}";
    }

    private static Preset? ReadPreset(JsonElement element)
    {
        try
        {
            return element.Deserialize<Preset>(PresetJson);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // ───────────────────────────── jobs ─────────────────────────────

    /// <summary>Changes the page offers on top of a preset ("Options" next to the donut).</summary>
    public sealed class JobOptions
    {
        public int? Quality { get; set; }
        public bool? Zip { get; set; }
        public bool? MergePdf { get; set; }
        public string? PageRange { get; set; }
        public int? ResizePercent { get; set; }
        public int? LongEdge { get; set; }
        public bool? Grayscale { get; set; }
        public ImageRotation? Rotation { get; set; }
        public ImageFlip? Flip { get; set; }
        public bool? KeepMetadata { get; set; }
        public string? FileNamePattern { get; set; }
        public bool? SplitPages { get; set; }
        public int? RenderDpi { get; set; }
    }

    private static async Task<IResult> StartAsync(HttpRequest request, FileeServer server, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest(new { error = "Expected multipart/form-data." });
        var form = await request.ReadFormAsync(cancellationToken);
        var loc = WebLocalizer.For(form["lang"].FirstOrDefault() ?? request.Headers.AcceptLanguage.ToString());

        // The preset: the page's own (JSON), one of the library's (id), or a plain target format.
        Preset? preset = null;
        if (form["preset"].FirstOrDefault() is { Length: > 0 } json)
        {
            try
            {
                preset = JsonSerializer.Deserialize<Preset>(json, PresetJson);
            }
            catch (JsonException e)
            {
                return Results.BadRequest(new { error = $"Invalid preset: {e.Message}" });
            }
        }
        else if (form["presetId"].FirstOrDefault() is { Length: > 0 } presetId)
        {
            preset = server.Store.FindPreset(presetId)?.Clone();
            if (preset is null)
                return Results.BadRequest(new { error = $"No preset '{presetId}'." });
        }
        else if (form["target"].FirstOrDefault() is { Length: > 0 } target)
        {
            var format = FormatRegistry.FindById(target.Trim().TrimStart('.').ToLowerInvariant())
                         ?? FormatRegistry.FindByExtension(target);
            if (format is null || !format.Writable)
                return Results.BadRequest(new { error = $"Filee can't write '{target}'." });
            preset = new Preset { TargetFormat = format.Id };
        }
        if (preset is null)
            return Results.BadRequest(new { error = "Choose a preset or a format." });
        if (preset.IsGroup)
            return Results.BadRequest(new { error = loc["donut.pick_in_group"] });
        if (preset.IsTool)
        {
            // The crop tool runs in the browser; what it sends back is converted to the original format.
            preset.Kind = PresetKind.Convert;
        }

        if (form["options"].FirstOrDefault() is { Length: > 0 } optionsJson)
        {
            try
            {
                Apply(preset, JsonSerializer.Deserialize<JobOptions>(optionsJson, PresetJson) ?? new());
            }
            catch (JsonException e)
            {
                return Results.BadRequest(new { error = $"Invalid options: {e.Message}" });
            }
        }

        var urls = form["urls"].Where(u => !string.IsNullOrWhiteSpace(u)).Select(u => u!.Trim()).ToList();
        if (urls.Count > 0 && !FileeServer.AllowUrls)
            return Results.BadRequest(new { error = "Downloading links is turned off on this server." });
        if (urls.Any(u => !UrlFetcher.IsUrl(u)))
            return Results.BadRequest(new { error = loc["error.web_download_failed"] });
        if (form.Files.Count == 0 && urls.Count == 0)
            return Results.BadRequest(new { error = "No files." });
        if (form.Files.Sum(f => f.Length) > FileeServer.MaxUploadBytes)
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

        var folder = server.NewFolder(out var id);
        var input = Path.Combine(folder, "in");
        var sources = new List<string>();
        var names = new List<string>();
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Files keep the order the page sent them in: it is the merge order of "Merge PDF".
        foreach (var file in form.Files)
        {
            var name = Unique(taken, SafeName(file.FileName));
            var path = Path.Combine(input, name);
            await using (var stream = File.Create(path))
                await file.CopyToAsync(stream, cancellationToken);
            sources.Add(path);
            names.Add(name);
        }
        sources.AddRange(urls);
        names.AddRange(urls);

        var web = server.Start(id, folder, sources, names, preset, loc.DisplayName(preset));
        return Results.Json(Status(web, loc));
    }

    private static void Apply(Preset preset, JobOptions o)
    {
        if (o.Quality is { } quality)
            preset.Image.Quality = Math.Clamp(quality, 1, 100);
        if (o.Zip is { } zip)
            preset.Output.ZipResult = zip;
        if (o.MergePdf is { } merge && preset.TargetFormat == "pdf")
            preset.Pdf.MergeIntoSingle = merge;
        if (o.PageRange is { } range)
            preset.Pdf.PageRange = range.Trim();
        if (o.SplitPages is { } split)
            preset.Pdf.SplitPages = split;
        if (o.RenderDpi is { } dpi)
            preset.Pdf.RenderDpi = Math.Clamp(dpi, 36, 1200);
        if (o.ResizePercent is { } percent and > 0 and < 100)
        {
            preset.Image.Resize = ResizeMode.Percent;
            preset.Image.ResizePercent = percent;
        }
        else if (o.LongEdge is { } edge and > 0)
        {
            preset.Image.Resize = ResizeMode.LongEdge;
            preset.Image.LongEdge = edge;
        }
        if (o.Grayscale is { } gray)
            preset.Image.Grayscale = gray;
        if (o.Rotation is { } rotation)
            preset.Image.Rotation = rotation;
        if (o.Flip is { } flip)
            preset.Image.Flip = flip;
        if (o.KeepMetadata is { } keep)
            preset.Image.KeepMetadata = keep;
        if (o.FileNamePattern is { Length: > 0 } pattern)
            preset.Output.FileNamePattern = pattern;
    }

    private static List<string> Outputs(WebJob web) =>
        web.Job.Outputs.Where(p => Path.GetFullPath(p).StartsWith(web.Folder + Path.DirectorySeparatorChar, StringComparison.Ordinal)).ToList();

    private static object Status(WebJob web, ILocalizer loc)
    {
        var job = web.Job;
        var outputs = Outputs(web);
        var transfer = job.Transfer();
        return new
        {
            id = web.Id,
            preset = job.PresetDisplayName,
            target = job.Preset.TargetFormat,
            state = job.State.ToString(),
            finished = web.IsFinished,
            progress = Math.Round(job.Progress, 3),
            createdAt = web.CreatedAt,
            expiresAt = (web.FinishedAt ?? DateTime.UtcNow) + FileeServer.JobLifetime,
            transfer = transfer is { } t ? new { bytes = t.Bytes, total = t.Total } : null,
            files = job.Files.Select((f, i) => new
            {
                name = i < web.OriginalNames.Count ? web.OriginalNames[i] : Path.GetFileName(f.SourcePath),
                state = f.State.ToString(),
                progress = Math.Round(f.Progress, 3),
                error = f.State is FileState.Failed ? Error(f, loc) : f.State is FileState.Cancelled ? loc["toast.cancelled"] : null,
                notice = f.NoticeKey is null ? null : loc[f.NoticeKey],
                outputs = f.Outputs.Select(o => outputs.IndexOf(o)).Where(n => n >= 0),
            }),
            outputs = outputs.Select((o, i) =>
            {
                var info = new FileInfo(o);
                return new
                {
                    index = i,
                    name = Path.GetFileName(o),
                    size = info.Exists ? info.Length : 0,
                    type = ContentTypes.TryGetContentType(o, out var contentType) ? contentType : "application/octet-stream",
                };
            }),
        };
    }

    private static string Error(FileResult file, ILocalizer loc)
    {
        var message = file.ErrorKey is null ? loc["error.conversion_failed"] : loc[file.ErrorKey];
        return string.IsNullOrWhiteSpace(file.ErrorDetail) ? message : $"{message} ({file.ErrorDetail})";
    }

    // ───────────────────────────── names ─────────────────────────────

    /// <summary>A file name from the browser, safe to save: no folders, no characters the file system refuses.</summary>
    internal static string SafeName(string name)
    {
        var file = Path.GetFileName(name.Replace('\\', '/').Split('/').Last()).Trim();
        foreach (var c in Path.GetInvalidFileNameChars().Concat(new[] { '<', '>', ':', '"', '|', '?', '*' }))
            file = file.Replace(c, '_');
        file = file.Trim('.', ' ');
        if (file.Length == 0)
            file = "file";
        if (file.Length > 180)
        {
            var extension = Path.GetExtension(file);
            file = file[..(180 - Math.Min(extension.Length, 20))] + extension[..Math.Min(extension.Length, 20)];
        }
        return file;
    }

    /// <summary><paramref name="name"/>, or "name (2).ext", "name (3).ext"... when it is taken.</summary>
    internal static string Unique(HashSet<string> taken, string name)
    {
        if (taken.Add(name))
            return name;
        var stem = Path.GetFileNameWithoutExtension(name);
        var extension = Path.GetExtension(name);
        var folder = Path.GetDirectoryName(name);
        for (var n = 2; ; n++)
        {
            var candidate = $"{stem} ({n}){extension}";
            if (!string.IsNullOrEmpty(folder))
                candidate = $"{folder}/{candidate}";
            if (taken.Add(candidate))
                return candidate;
        }
    }
}
