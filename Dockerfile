FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Install Node.js 20, Chromium, and virtual display for browser tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates gnupg git && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    nodejs \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    xterm \
    xdotool \
    imagemagick \
    tesseract-ocr \
    tesseract-ocr-por \
    poppler-utils \
    jq \
    unzip && \
    apt-get purge -y gnupg && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Git ready to commit: without an identity `git commit` fails, and that is the
# invisible blocker of any code flow. The askpass helper answers the token from
# the child environment, so it never reaches argv or .git/config.
RUN git config --system user.name "Solides Agent" && \
    git config --system user.email "agent@solides.local" && \
    git config --system init.defaultBranch main && \
    git config --system advice.detachedHead false && \
    git config --system safe.directory '*' && \
    printf '#!/bin/sh\nprintf %%s "$NANOBOT_GIT_PASSWORD"\n' \
      > /usr/local/bin/nanobot-git-askpass && \
    chmod 755 /usr/local/bin/nanobot-git-askpass

# Kiro CLI: the code agent the platform delegates writing code to, headless.
#
# Two things to know before touching this. It adds ~856 MB to the image (three
# binaries, kiro-cli-chat alone is ~700 MB), so it is behind the KIRO_CLI build
# arg and off by default — turn it on for the image that actually runs code
# delegation. And the vendor only ships an unpinned installer script: pin a
# version as soon as they publish one, and treat this as a supply-chain dependency.
ARG KIRO_CLI=0
RUN if [ "$KIRO_CLI" = "1" ]; then \
      curl -fsSL https://cli.kiro.dev/install | bash && \
      /root/.local/bin/kiro-cli --version; \
    fi
ENV PATH="/root/.local/bin:${PATH}"

# Tell Puppeteer to use system Chromium (non-headless, renders on Xvfb)
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DISPLAY=:99

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY pyproject.toml README.md LICENSE ./
RUN mkdir -p nanobot bridge && touch nanobot/__init__.py && \
    uv pip install --system --no-cache . && \
    rm -rf nanobot bridge

# Copy the full source so npm can build
COPY nanobot/ nanobot/
COPY bridge/ bridge/

# Build the WhatsApp bridge
WORKDIR /app/bridge
RUN npm install && npm run build
WORKDIR /app

# Build the frontend web UI
WORKDIR /app/nanobot/web/frontend
RUN npm install && npm run build
WORKDIR /app

# Install Python package (now with the built static files included)
RUN uv pip install --system --no-cache .

# Create config directory
RUN mkdir -p /root/.nanobot

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Gateway + noVNC ports
EXPOSE 18790 6080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gateway", "--multiuser"]
