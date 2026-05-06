# syntax=docker/dockerfile:1
# Hugging Face Spaces · fly.io · Cloud Run 공용 컨테이너 이미지

# ─── stage 1: build (devDependencies 포함) ────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── stage 2: runtime (production deps only) ──────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=7860 \
    HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY data ./data
EXPOSE 7860
CMD ["node", "dist/http.js"]
