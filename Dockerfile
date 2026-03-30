# ── Stage 1: build whisper.cpp ───────────────────────────────────────────────
FROM ubuntu:22.04 AS whisper-builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
        git cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/ggml-org/whisper.cpp /whisper.cpp
WORKDIR /whisper.cpp
# CPU-only build; fast enough for 16 kHz mono and avoids CUDA dev toolchain.
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release --target whisper-cli -j$(nproc)


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
        ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=whisper-builder /whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

# uv manages Python 3.13 and the project venv.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./
# uv sync on Linux installs torch with bundled CUDA 13.x Python packages;
# GPU access is provided at runtime by the NVIDIA Container Toolkit (--gpus all).
RUN uv sync --no-dev

COPY scripts/ ./scripts/
COPY docker/  ./docker/
RUN chmod +x /app/docker/*.sh

# Make the venv's Python the default.
ENV VIRTUAL_ENV=/app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Override these with -e if your model filenames differ.
ENV WHISPER_MODEL=/models/ivrit-ggml-large-v3-turbo.bin
ENV VAD_MODEL=/models/ggml-silero-v6.2.0.bin

ENTRYPOINT ["/app/docker/entrypoint.sh"]
