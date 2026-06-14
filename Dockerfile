# Tiny always-on keep-alive worker for Coolify.
# Pings every Supabase project in projects.json, then sleeps (default 72h), forever.
FROM node:20-alpine
WORKDIR /app
COPY keepalive.mjs projects.json ./
ENV KEEPALIVE_LOOP=1
ENV KEEPALIVE_INTERVAL_HOURS=72
CMD ["node", "keepalive.mjs"]
