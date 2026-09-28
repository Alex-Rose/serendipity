# serendipity server: the web app, the API and a headless Chromium for
# capturing links. The server shares code with ../extractor and ../web, so
# build from the repository root:
#
#   docker build -f server/Dockerfile -t serendipity-server .
#
# or use server/compose.yaml, which also runs MongoDB.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY extractor/package.json extractor/package-lock.json extractor/
RUN cd extractor && npm ci --ignore-scripts
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --ignore-scripts
COPY extractor/ extractor/
COPY web/src/ web/src/
COPY web/scripts/wordlist.txt web/scripts/
COPY server/ server/
RUN cd extractor && npm run build && cd ../server && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY extractor/package.json extractor/package-lock.json extractor/
RUN cd extractor \
    && npm ci --omit=dev --ignore-scripts \
    && npx playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --ignore-scripts && rm -rf /root/.npm
COPY --from=build /app/extractor/dist extractor/dist
COPY --from=build /app/server/dist server/dist
COPY server/src server/src
COPY web/scripts/wordlist.txt web/scripts/

WORKDIR /app/server
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
