# Filee web: the desktop app's converters behind a web page, in one container.
#   docker build -t filee .
#   docker run -p 8080:8080 -v filee-data:/data filee        then open http://localhost:8080
# Ubuntu 24.04 (noble) because the pinned rhwp release needs glibc 2.39.

# ── 1. build the server (.NET SDK) ──────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Filee.Web/Filee.Web.csproj -c Release -o /out/app --no-self-contained \
    -p:DebugType=none -p:UseAppHost=false

# ── 2. fetch rhwp, the HWP converter Filee doesn't ship in NuGet (pinned in engines.json) ───
FROM ubuntu:24.04 AS engines
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /engines
# rhwp (HWP / HWPX -> PDF). Upstream ships x86_64 and aarch64 builds, checked by SHA-256.
RUN set -eux; \
    if [ "$TARGETARCH" = "arm64" ]; then \
      URL=https://github.com/edwardkim/rhwp/releases/download/v0.8.7/rhwp-v0.8.7-linux-aarch64.tar.gz; \
      SHA=C4A70F5ED11B99586EE89D1AC9069145D58A0831D00E87858BB01626E2EBF313; \
    else \
      URL=https://github.com/edwardkim/rhwp/releases/download/v0.8.7/rhwp-v0.8.7-linux-x86_64.tar.gz; \
      SHA=F1E541A25CFE76B6BC1DAF18BF9C1F9A5AC5E03E2C01B188DAAF54107214F631; \
    fi; \
    curl -fsSL "$URL" -o rhwp.tar.gz; \
    echo "$SHA  rhwp.tar.gz" | sha256sum -c -; \
    mkdir -p rhwp-x && tar -xzf rhwp.tar.gz -C rhwp-x; \
    mkdir -p rhwp && find rhwp-x -type f -name rhwp -exec cp {} rhwp/rhwp \; ; \
    chmod +x rhwp/rhwp; \
    rm -rf rhwp-x rhwp.tar.gz

# ── 3. the runtime image ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime
ENV DEBIAN_FRONTEND=noninteractive \
    ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    FILEE_DATA_DIR=/data \
    FILEE_JOBS_DIR=/tmp/filee-jobs \
    FILEE_JOB_TTL_MINUTES=60 \
    FILEE_MAX_UPLOAD_MB=2048

# 7-Zip, FFmpeg, Ghostscript, Pandoc and fonts: found on the PATH, Filee uses them when present.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ghostscript pandoc curl ca-certificates 7zip \
        fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/app ./
COPY --from=engines /engines/rhwp ./engines/rhwp
# 7-Zip (archives): Filee looks for engines/7zip/7zz; the distribution's 7-Zip is the same program.
RUN mkdir -p ./engines/7zip && ln -sf /usr/bin/7zz ./engines/7zip/7zz

# Settings, presets and the engines' own state live here: mount a volume to keep them across updates.
RUN mkdir -p /data /tmp/filee-jobs && chown -R app:app /data /tmp/filee-jobs /app
VOLUME ["/data"]
USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8080/healthz || exit 1

ENTRYPOINT ["dotnet", "filee-web.dll"]
