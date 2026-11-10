FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/src/ ./src/
COPY --chown=node:node shared/ /shared/
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/app/data/catalog.sqlite
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
