// Whether a preset can run for a set of files and why not: the web twin of Filee.App's PresetAvailability, used to
// grey out donut slices. Engines are installed in the container image, so there is no "download this engine" case.

using Filee.Core.Conversion;
using Filee.Core.Formats;
using Filee.Core.Localization;
using Filee.Core.Presets;

namespace Filee.Web;

public sealed class Availability(ConverterCatalog catalog)
{
    /// <summary>Formats the crop tool reads and writes back (one frame, writable).</summary>
    public static readonly HashSet<string> CroppableFormats =
    [
        "jpg", "png", "webp", "bmp", "avif", "jxl", "jp2", "tga", "qoi", "dds", "pcx",
    ];

    /// <summary>One check for many presets of the same files (the planner is built once).</summary>
    public Session For(IReadOnlyList<FileFormat> formats, bool anyFile) => new(this, formats, anyFile);

    public sealed class Session
    {
        private readonly Availability _owner;
        private readonly IReadOnlyList<FileFormat> _formats;
        private readonly bool _anyFile;
        private RoutePlanner? _planner;

        internal Session(Availability owner, IReadOnlyList<FileFormat> formats, bool anyFile)
        {
            _owner = owner;
            _formats = formats;
            _anyFile = anyFile;
        }

        private RoutePlanner Planner => _planner ??= _owner._catalog.CreatePlanner();

        /// <summary>Null when the preset converts at least one of the files, else the localization key of why not.</summary>
        public string? ReasonKey(Preset preset)
        {
            if (preset.IsGroup)
                return null;
            if (preset.IsTool)
                return _formats.Count > 0 && _formats.All(f => CroppableFormats.Contains(f.Id)) ? null : "error.unsupported_source";

            if (preset.PacksIntoOneArchive)
            {
                var archive = FormatRegistry.Get(preset.TargetFormat).Id;
                return _owner._catalog.All.OfType<IFileCombiner>().Any(c => c.CanCombineInto(archive)) ? null : "error.no_route";
            }

            // While a drag is still over the page the browser doesn't say every type: anything may be possible.
            if (_formats.Count == 0)
                return _anyFile ? null : "error.unsupported_source";

            var merge = preset.Pdf.MergeIntoSingle && preset.TargetFormat == "pdf";
            var turns = preset.Image.TurnsOrMirrors;
            var copiesUnturned = false;
            var possible = _formats.Any(f =>
            {
                var target = preset.TargetFormat == BuiltInData.SameAsSource ? f.Id : preset.TargetFormat;
                if (merge && f.Id == "pdf" && !turns)
                    return true;
                var frames = preset.SavesFramesOf(f.Id);
                var motion = preset.ExtractsMotionOf(f.Id);
                var live = preset.MakesLivePhotoOf(f.Id);
                if (!turns)
                    return Planner.CanConvert(f.Id, target, frames, motionPhoto: motion, livePhoto: live);
                if (Planner.Plan(f.Id, target, frames, motionPhoto: motion, livePhoto: live) is not { } route)
                    return false;
                if (route.FirstTransformStep() >= 0)
                    return true;
                copiesUnturned = true;
                return false;
            });
            if (possible)
                return null;
            return copiesUnturned ? "error.cannot_turn" : "error.no_route";
        }

        /// <summary>Every writable format at least one of the files converts to ("Convert to..." on the page).</summary>
        public IReadOnlyList<FileFormat> Targets() =>
            FormatRegistry.Known
                .Where(t => t.Writable && t.Id != FormatRegistry.Folder)
                .Where(t => _formats.Any(f => f.Id != t.Id && Planner.CanConvert(f.Id, t.Id)))
                .ToList();
    }

    private readonly ConverterCatalog _catalog = catalog;
}
