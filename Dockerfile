# ── Stage 1: build whisper.cpp ───────────────────────────────────────────────
FROM nvidia/cuda:12.6.3-cudnn-devel-ubuntu22.04 AS whisper-builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
        git cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/ggml-org/whisper.cpp /whisper.cpp
WORKDIR /whisper.cpp

ENV LD_LIBRARY_PATH="$LD_LIBRARY_PATH:/usr/local/cuda-12.6/compat"

RUN sed -i 's#set(BUILD_SHARED_LIBS_DEFAULT ON)#set(BUILD_SHARED_LIBS_DEFAULT OFF)#g' /whisper.cpp/CMakeLists.txt

RUN cmake -B build -DGGML_CUDA=1 \
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

# uv manages Python 3.13 and the project venv.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

RUN uv python install 3.13

# Install torch from the PyTorch CUDA 12.6 wheel index (no nvidia-* packages).
# Install remaining deps from pyproject.toml directly.
# We bypass the lock file here because it resolved torch for Windows (CPU).
RUN uv pip install --system --break-system-packages \
        torch torchaudio torchcodec \
        --index-url https://download.pytorch.org/whl/cu126 \
    && uv pip install --system --break-system-packages \
        "pyannote.audio>=4.0,<5.0" \
        python-dotenv

RUN mkdir -p /app/whisper.cpp
COPY --from=whisper-builder /whisper.cpp/build/bin/whisper-cli /app/whisper.cpp/whisper-cli

COPY scripts/ ./scripts/
COPY docker/  ./docker/
RUN chmod +x /app/docker/*.sh

# Override these with -e if your model filenames differ.
ENV WHISPER_MODEL=/models/ivrit-ggml-large-v3-turbo.bin
ENV VAD_MODEL=/models/ggml-silero-v6.2.0.bin

ENTRYPOINT ["/app/docker/entrypoint.sh"]
