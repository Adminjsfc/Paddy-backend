FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node sql ./sql
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3015
EXPOSE 3015
CMD ["node", "src/server.js"]
