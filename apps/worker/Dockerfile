# syntax=docker/dockerfile:1

# bookworm-slim, NOT node:22-alpine like apps/api. The pinned ffmpeg below is a
# glibc-linked static build; on alpine's musl the binary will not execute at all. Copying
# the api Dockerfile's base is the trap here.
FROM node:22-bookworm-slim AS base

# Same turbo-prune pattern as apps/api: reduces the monorepo to what `worker` needs so
# npm's hoisting cannot scatter files in ways a plain COPY fails to predict.
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.1.3
COPY . .
RUN turbo prune worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm install
COPY --from=pruner /app/out/full/ .
RUN npm run build --workspace=worker
RUN npm prune --omit=dev

FROM base AS runner
WORKDIR /app/apps/worker
ENV NODE_ENV=production

# Pinned by version AND checksum. Two workers on one queue must produce comparable
# renditions, and "whatever ffmpeg the base image ships this month" cannot promise that. A
# static build is chosen over a distro package so there is no shared-library drift against
# the Node image either. Bump FFMPEG_VERSION and FFMPEG_SHA256 together.
ARG FFMPEG_VERSION=7.0.2
ARG FFMPEG_SHA256=abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-amd64-static.tar.xz" -o /tmp/ffmpeg.tar.xz \
 && echo "${FFMPEG_SHA256}  /tmp/ffmpeg.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp --strip-components=1 \
 && install -m755 /tmp/ffmpeg /tmp/ffprobe /usr/local/bin/ \
 && apt-get purge -y curl xz-utils \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* /tmp/ffmpeg*

# Asserted against the actual binary at boot (see assertFfmpegVersion): the worker refuses
# to start on a mismatch, which is what makes the pin enforceable rather than documentary.
ENV EXPECTED_FFMPEG_VERSION=${FFMPEG_VERSION}

COPY --chown=node:node --from=installer /app/node_modules /app/node_modules
COPY --chown=node:node --from=installer /app/apps/worker/dist ./dist
COPY --chown=node:node --from=installer /app/apps/worker/node_modules ./node_modules

# Created and owned here, before USER node, because Docker seeds a fresh named volume's
# ownership from whatever the image has at the mount point. Without this the scratch
# volume mounts root-owned, the unprivileged process cannot write to it, and the boot
# check refuses to start — correctly, but for a reason that is entirely avoidable.
RUN mkdir -p /scratch && chown node:node /scratch

USER node
# No entrypoint script and no EXPOSE: the worker runs no migrations and accepts no inbound
# connections. It reaches out to Redis, the bucket and the callback URL, which is exactly
# what lets this same image run on a laptop behind NAT with no tunnelling.
ENTRYPOINT ["node", "dist/main.js"]
