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
# nvidia/cuda provides the CUDA runtime so we can install torch from the
# PyTorch wheel index (a single self-contained wheel) instead of pulling
# ~8 GB of nvidia-* Python packages from PyPI.
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
        ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=whisper-builder /whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

# uv manages Python 3.13 and the project venv.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Install torch from the PyTorch CUDA 12.6 wheel index (no nvidia-* packages).
# Install remaining deps from pyproject.toml directly.
# We bypass the lock file here because it resolved torch for Windows (CPU).
RUN uv pip install --python 3.13 --system \
        torch torchaudio \
        --index-url https://download.pytorch.org/whl/cu126 \
    && uv pip install --python 3.13 --system \
        "pyannote.audio>=3.3,<4.0" \
        python-dotenv

COPY scripts/ ./scripts/
COPY docker/  ./docker/
RUN chmod +x /app/docker/*.sh

# Override these with -e if your model filenames differ.
ENV WHISPER_MODEL=/models/ivrit-ggml-large-v3-turbo.bin
ENV VAD_MODEL=/models/ggml-silero-v6.2.0.bin

ENTRYPOINT ["/app/docker/entrypoint.sh"]
