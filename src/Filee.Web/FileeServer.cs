// The conversion pipeline behind the web page: settings and presets (FILEE_DATA_DIR), every engine of the container
// image and one job queue, as CliHost does for the command line. Each conversion gets its own folder with the uploaded
// files (in/) and the results (out/); folders are deleted after FILEE_JOB_TTL_MINUTES.

using System.Collections.Concurrent;
using Filee.Core.Conversion;
using Filee.Core.Presets;
using Filee.Core.Settings;
using Filee.Core.Web;
using Filee.Engines;
using Filee.Engines.Infrastructure;

namespace Filee.Web;

/// <summary>A conversion started from the page.</summary>
public sealed class WebJob
{
    /// <summary>Unguessable id: whoever has it can download the results.</summary>
    public required string Id { get; init; }
    public required string Folder { get; init; }
    public required ConversionJob Job { get; init; }
    public required IReadOnlyList<string> OriginalNames { get; init; }
    public DateTime CreatedAt { get; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
    public bool IsFinished => FinishedAt is not null;
    public string InputFolder => Path.Combine(Folder, "in");
    public string OutputFolder => Path.Combine(Folder, "out");
}

public sealed class FileeServer : BackgroundService
{
    private readonly ConcurrentDictionary<string, WebJob> _jobs = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<ConversionJob, WebJob> _byJob = new();
    private readonly ILogger<FileeServer> _log;

    public FileeServer(ILogger<FileeServer> log, ILoggerFactory loggers)
    {
        _log = log;
        Store = new UserDataStore(UserDataStore.DefaultDirectory);
        Store.Load();
        EngineEnvironment.OwnCopies = new Dictionary<string, string>(Store.Settings.EngineOwnCopies);
        EngineEnvironment.LibreOfficeForSlides = Store.Settings.LibreOfficeForSlides;
        EngineEnvironment.LibreOfficeForHwp = Store.Settings.LibreOfficeForHwp;
        EngineEnvironment.LibreOfficeForDocuments = Store.Settings.LibreOfficeForDocuments;
        EngineEnvironment.LibreOfficeForSheets = Store.Settings.LibreOfficeForSheets;
        var converters = EngineRegistry.CreateAll(new EngineEnvironment(Store.Directory), loggers);
        Catalog = new ConverterCatalog(converters) { Priority = Store.Settings.EnginePriority };
        Queue = new JobQueue(Catalog, EngineRegistry.FindPdfMerger(converters), loggers.CreateLogger<JobQueue>(),
            combiner: EngineRegistry.FindFileCombiner(converters), tiffMerger: EngineRegistry.FindTiffMerger(converters));
        Queue.JobFinished += (_, job) =>
        {
            if (!_byJob.TryGetValue(job, out var web))
                return;
            web.FinishedAt = DateTime.UtcNow;
            _log.LogInformation("Job {Id} finished: {State}, {Count} output(s)", web.Id, job.State, job.Outputs.Count());
        };
        Availability = new Availability(Catalog);
        Directory.CreateDirectory(JobsRoot);
        _ = Catalog.CheckInBackgroundAsync();
    }

    public UserDataStore Store { get; }
    public ConverterCatalog Catalog { get; }
    public JobQueue Queue { get; }
    public Availability Availability { get; }

    /// <summary>Where uploads and results live (FILEE_JOBS_DIR, else Filee's temp folder).</summary>
    public static string JobsRoot { get; } = Environment.GetEnvironmentVariable("FILEE_JOBS_DIR") is { Length: > 0 } dir
        ? Path.GetFullPath(dir) : Path.Combine(Path.GetTempPath(), "filee-web");

    /// <summary>How long results stay downloadable.</summary>
    public static TimeSpan JobLifetime { get; } =
        TimeSpan.FromMinutes(int.TryParse(Environment.GetEnvironmentVariable("FILEE_JOB_TTL_MINUTES"), out var m) && m > 0 ? m : 60);

    /// <summary>Upload limit for one conversion, in bytes.</summary>
    public static long MaxUploadBytes { get; } =
        (long.TryParse(Environment.GetEnvironmentVariable("FILEE_MAX_UPLOAD_MB"), out var mb) && mb > 0 ? mb : 2048) * 1024 * 1024;

    /// <summary>The page may ask the server to download links (FILEE_ALLOW_URLS=false turns it off).</summary>
    public static bool AllowUrls { get; } =
        !string.Equals(Environment.GetEnvironmentVariable("FILEE_ALLOW_URLS"), "false", StringComparison.OrdinalIgnoreCase);

    public WebJob? Find(string id) => _jobs.GetValueOrDefault(id);

    /// <summary>A new, empty job folder (in/ and out/).</summary>
    public string NewFolder(out string id)
    {
        id = Guid.NewGuid().ToString("N");
        var folder = Path.Combine(JobsRoot, id);
        Directory.CreateDirectory(Path.Combine(folder, "in"));
        Directory.CreateDirectory(Path.Combine(folder, "out"));
        return folder;
    }

    /// <summary>Queues the conversion of files already saved in the job folder (and of links the queue downloads first).</summary>
    public WebJob Start(string id, string folder, IReadOnlyList<string> sources, IReadOnlyList<string> names, Preset preset, string displayName)
    {
        var output = Store.Settings.WithDefaultOutput(preset).Clone();
        output.Output.Location = OutputLocation.CustomFolder;
        output.Output.CustomFolder = Path.Combine(folder, "out");
        output.Output.KeepFoldersFrom = "";
        output.Output.SourceFolder = null;
        if (output.Output.Conflict == ConflictPolicy.Skip)
            output.Output.Conflict = ConflictPolicy.Rename; // the out folder is empty: skipping would only lose files

        var fetcher = sources.Any(UrlFetcher.IsUrl) ? new UrlFetcher(Path.Combine(folder, "in")) : null;
        var job = new ConversionJob(sources, output, displayName, fetcher);
        var web = new WebJob { Id = id, Folder = folder, Job = job, OriginalNames = names };
        _jobs[id] = web;
        _byJob[job] = web;
        _ = Task.Run(async () =>
        {
            try
            {
                await Queue.RunAsync(job);
            }
            catch (Exception e)
            {
                _log.LogError(e, "Job {Id} crashed", id);
            }
            finally
            {
                web.FinishedAt ??= DateTime.UtcNow;
            }
        });
        return web;
    }

    /// <summary>Cancels a job and deletes its files.</summary>
    public void Remove(string id)
    {
        if (!_jobs.TryRemove(id, out var web))
            return;
        web.Job.Cancel();
        _byJob.TryRemove(web.Job, out _);
        _ = Task.Run(async () =>
        {
            // Give running engines a moment to let go of their files.
            for (var i = 0; i < 20 && !web.IsFinished; i++)
                await Task.Delay(500);
            TryDelete(web.Folder);
        });
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Folders of a previous run of the server are no longer reachable.
        foreach (var folder in Directory.EnumerateDirectories(JobsRoot))
            TryDelete(folder);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTime.UtcNow;
            foreach (var web in _jobs.Values)
            {
                var expired = web.FinishedAt is { } done ? now - done > JobLifetime : now - web.CreatedAt > JobLifetime * 6;
                if (expired)
                    Remove(web.Id);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        foreach (var web in _jobs.Values)
            web.Job.Cancel();
        await Queue.DisposeAsync();
    }

    private void TryDelete(string folder)
    {
        try
        {
            if (Directory.Exists(folder))
                Directory.Delete(folder, recursive: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            _log.LogWarning("Couldn't delete {Folder}: {Message}", folder, e.Message);
        }
    }
}


/// <summary>
/// Downloads the links given on the page when their job runs, with the app's WebDownloader (size limit, refuses web
/// pages and programs), so the download shows its progress and errors like a conversion.
/// </summary>
public sealed class UrlFetcher(string folder) : ISourceFetcher
{
    private static readonly WebDownloader Downloader = new();

    public static bool IsUrl(string source) =>
        Uri.TryCreate(source, UriKind.Absolute, out var url) && WebDownloader.IsWebAddress(url);

    public bool Fetches(string source) => IsUrl(source);

    public Task<string> FetchAsync(string source, IProgress<TransferProgress> progress, CancellationToken cancellationToken) =>
        Downloader.DownloadAsync(new Uri(source), folder, null, progress, cancellationToken);

    public void Release(ConversionJob job) { }
}
